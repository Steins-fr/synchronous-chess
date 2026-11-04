import { computed, Signal, signal } from '@angular/core';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { commitmentOf, CommitmentPart, drawSalt, isCommitment } from '@app/modules/commit-reveal/classes/commitment';
import { DrawPhase, DrawStep, FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SealedCommitments } from '@app/modules/commit-reveal/classes/sealed-commitments';
import { SealedStore } from '@app/modules/commit-reveal/classes/sealed-store';
import { SeatedPlayer, TableSeats } from '@app/modules/game-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Observable, Subject, Subscription } from 'rxjs';
import { AskerDraw, drawAsker } from '../rules/asker';
import { Applied, MinorityGameState, MinorityPhase } from '../rules/minority-game-state';
import { isSetup, MINORITY_RULES, MinorityRules, MinoritySetup, Vote } from '../rules/minority-rules';
import { isQuestionText } from '../rules/question';
import {
    MGGameSessionType, MinorityCommitMessage, MinorityDrawMessage, MinorityMessage, MinorityPayloads, MinorityQuestionMessage, MinorityRevealMessage,
    MinorityRound, MinorityTimeoutMessage, QuestionKey,
} from './minority-messages';
import { PlayedMinorityGame } from './played-minority-game';

export interface MinoritySessionOptions {
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: MinorityRules;
}

/** A vote the local player committed to, kept to reveal it */
interface Seal {
    /** The question of the vote */
    readonly key: string;
    readonly vote: Vote;
    readonly salt: string;
}

/** The steps of the draw before the game: its commitments, then its reveals */
const DRAW_STEPS: number = 2;
/**
 * The seconds a claim of a timeout may come before the end of the time of its phase, on the time of the chain: the
 * clocks of the pages start once they receive the block opening the phase
 */
const CLAIM_SLACK: number = 2;

const keyOf = (question: Readonly<QuestionKey>): string => `${ question.round }:${ question.ask }`;

/**
 * The Minority Game in a room. The participants take the seats themselves; a seated player starts the game once 3
 * players or more are seated, with the variant and the time of a vote it picked: the seats are final until it is over.
 * The players draw the seed of the game at once, each one committing to a random part then revealing it: the seed draws
 * the asker of each question, alike on every page. Then the asker asks its question, and the players still in vote at
 * the same time: each one commits to its vote, and reveals it once every voter committed. No participant, the sequencer
 * included, reads a vote before the vote is closed.
 *
 * A phase closes as soon as every player it waits for acted, else once its time is over: a player claims it, the first
 * claim in the chain counting, and the players it waited for missed it. A claim coming before the time of the phase, on
 * the time of the chain, is void.
 */
export class MinoritySession {
    public readonly rules: MinorityRules = this.options.rules ?? MINORITY_RULES;

    private readonly _played = signal<PlayedMinorityGame>(new PlayedMinorityGame(0, 0));
    /** The game in progress, else the latest */
    public readonly played: Signal<PlayedMinorityGame> = this._played.asReadonly();
    private readonly _pastGames = signal<ReadonlyArray<Readonly<PlayedMinorityGame>>>([]);
    /** The games over before the one in progress, the first one first */
    public readonly pastGames: Signal<ReadonlyArray<Readonly<PlayedMinorityGame>>> = this._pastGames.asReadonly();
    /** The game, once its seed is drawn */
    public readonly game: Signal<MinorityGameState | null> = computed((): MinorityGameState | null => this._played().game());
    /** The setup of the game, once a player started it */
    public readonly setup: Signal<Readonly<MinoritySetup> | null> = computed((): Readonly<MinoritySetup> | null => this._played().setup());

    private readonly _sending = signal<boolean>(false);
    /** A move of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();

    /** A player started the game: its players are final until it is over */
    public readonly started: Signal<boolean> = computed((): boolean => this._played().players().length > 0);
    public readonly over: Signal<boolean> = computed((): boolean => this._played().result() !== null);
    /** The seats are open until the game starts, and once it is over */
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => !this.started() || this.over());

    public readonly tableSeats = new TableSeats(this.room, {
        count: this.rules.seats,
        types: { seat: MGGameSessionType.SEAT, unseat: MGGameSessionType.UNSEAT },
        open: (): boolean => this.seatsOpen(),
        sending: this.sending,
    });
    /** The seated players not connected: the seats are the players of the game while it is played */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = this.tableSeats.awayPlayers;
    /** The players of the game, the seated ones in the order of their seats until it starts */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => this.started()
        ? this._played().players()
        : this.tableSeats.taken().map((player: Readonly<SeatedPlayer>) => player.name));
    /** The index of the local player among the players, none for a spectator */
    public readonly myIndex: Signal<number | null> = computed((): number | null => this.indexOf(this.room.localPlayer.name));
    /** The local player was eliminated: it follows the game as a spectator */
    public readonly eliminated: Signal<boolean> = computed((): boolean => {
        const me: number | null = this.myIndex();
        return me !== null && this.game()?.eliminated().includes(me) === true;
    });
    /** The local player plays the game in progress, still in: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over() && !this.eliminated());

    /** The players the game waits for: to draw the seed, then to act in each phase */
    public readonly awaited: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const game: MinorityGameState | null = this.game();
        if (game === null) {
            return this._played().drawWaitingFor();
        }
        return game.awaited().map((player: number) => this.players()[player]);
    });
    /** The asker of the question, once drawn */
    public readonly asker: Signal<string | null> = computed((): string | null => {
        const asker: number | null = this.game()?.asker() ?? null;
        return asker === null ? null : this.players()[asker];
    });
    /** The phases of the game: a claim of a timeout names it, a move closing the phase meanwhile voids it */
    public readonly step: Signal<number> = computed((): number => {
        const game: MinorityGameState | null = this.game();
        return game === null ? Number(this._played().drawPhase() === DrawPhase.REVEALING) : DRAW_STEPS + game.step();
    });
    /** The seconds of the phase in progress */
    public readonly phaseTime: Signal<number> = computed((): number => this.game()?.phaseTime() ?? this.rules.drawTime);

    /** Whether the local player may start the game: seated, with enough players, none started */
    public readonly canStart: Signal<boolean> = computed((): boolean => !this._sending() && !this.started()
        && this.tableSeats.mySeat() !== null && this.tableSeats.taken().length >= this.rules.minPlayers);
    /** Whether the local player may ask the question: the asker drawn */
    public readonly canAsk: Signal<boolean> = computed((): boolean => {
        const game: MinorityGameState | null = this.game();
        const me: number | null = this.myIndex();
        return !this._sending() && me !== null && game?.phase() === MinorityPhase.ASKING && game.asker() === me;
    });
    /** Whether the local player may vote: still in, not committed yet */
    public readonly canVote: Signal<boolean> = computed((): boolean => {
        const game: MinorityGameState | null = this.game();
        const me: number | null = this.myIndex();
        return !this._sending() && me !== null && game?.phase() === MinorityPhase.VOTING && game.alive().includes(me) && !game.committed().includes(me);
    });

    private readonly _seals = signal<ReadonlyMap<string, Readonly<Seal>>>(new Map());
    /**
     * The vote of the local player on the question, sealed until the votes are revealed. Once the vote closed, the game
     * counts it only when its commitment came in time: sent as the time ran out, it is no vote
     */
    public readonly myVote: Signal<Vote | null> = computed((): Vote | null => {
        const game: MinorityGameState | null = this.game();
        const me: number | null = this.myIndex();
        const revealing: boolean = game?.phase() === MinorityPhase.REVEALING && me !== null && game.committed().includes(me);

        if (game === null || (game.phase() !== MinorityPhase.VOTING && !revealing)) {
            return null;
        }
        return this._seals().get(this.questionKey(game))?.vote ?? null;
    });

    private readonly _voidedClaims = signal<number>(0);
    /** The claims of the local player voided as too early: its clock waits again */
    public readonly voidedClaims: Signal<number> = this._voidedClaims.asReadonly();
    // The session applied a live message: it caught up with the history of the room
    private live: boolean = false;
    private readonly _caughtUp = new Subject<void>();
    /** Emits once, right before the first live message applies: the table shows the history at once */
    public readonly caughtUp: Observable<void> = this._caughtUp.asObservable();

    /** The commitments of the game in progress, by question */
    private commitments = new SealedCommitments<string>();
    private seals?: SealedStore<Seal>;
    private parts?: SealedStore<string>;
    /** What the local player sent in this page, once: a reveal sent again after a reload is ignored by the others */
    private readonly sent = new Set<string>();
    /** The time of the chain the phase in progress opened at */
    private openedAt: number = 0;
    private readonly subscription: Subscription;
    /** The messages apply one after the other, in the order of the chain: a reveal checks its commitment first */
    private queue: Promise<void> = Promise.resolve();
    private pending: number = 0;

    public constructor(private readonly room: Room<MinorityPayloads>, private readonly options: MinoritySessionOptions = {}) {
        this.subscription = merge(...Object.values(MGGameSessionType).map((type: MGGameSessionType) => room.messenger(type)))
            .subscribe((message: MinorityMessage) => {
                this.pending++;
                const history: boolean = room.isHistory(message);
                this.queue = this.queue.then(async () => {
                    if (!history && !this.live) {
                        this.live = true;
                        this._caughtUp.next();
                    }
                    const step: string = this.stepKey();
                    await logHandlingFailure(message, this.apply(message));
                    if (this.stepKey() !== step) {
                        this.openedAt = room.sequencedAt(message) ?? 0;
                    }
                    // Once the messages received are applied, as a reloaded page catching up: the page acts on the chain
                    if (--this.pending === 0) {
                        await this.act();
                    }
                });
            });
    }

    public destroy(): void {
        this.subscription.unsubscribe();
    }

    public takeSeat(seat: number): void {
        this.tableSeats.takeSeat(seat);
    }

    public leaveSeat(): void {
        this.tableSeats.leaveSeat();
    }

    /** A seated player frees the seat of another one, away */
    public unseat(seat: number): void {
        this._sending.set(true);
        this.tableSeats.unseat(seat);
    }

    /** The local player starts the game with the seated players and its setup: then each one commits to its part of the draw */
    public start(setup: Readonly<MinoritySetup>): void {
        if (this.canStart() && isSetup(this.rules, setup)) {
            this._sending.set(true);
            this.room.transmitMessage(MGGameSessionType.DRAW, { ...this.round(), players: this.players(), variant: setup.variant, voteTime: setup.voteTime });
        }
    }

    /** The asker asks its question, trimmed */
    public ask(text: string): void {
        const game: MinorityGameState | null = this.game();
        const question: string = text.trim();

        if (game !== null && this.canAsk() && isQuestionText(question)) {
            this._sending.set(true);
            this.room.transmitMessage(MGGameSessionType.QUESTION, { ...this.round(), round: game.round(), ask: game.ask(), text: question });
        }
    }

    /** The local player votes: sealed until the vote closes */
    public async vote(vote: Vote): Promise<void> {
        const game: MinorityGameState | null = this.game();
        if (game === null || !this.canVote()) {
            return;
        }

        // The question of the vote, fixed before the hash: a timeout applied meanwhile moves to the next question
        const question: QuestionKey = { round: game.round(), ask: game.ask() };
        const round: MinorityRound = this.round();
        const key: string = keyOf(question);
        const salt: string = drawSalt();
        this._sending.set(true);
        this._seals.update((seals: ReadonlyMap<string, Readonly<Seal>>) => new Map([...seals, [key, { key, vote, salt }]]));
        const commitment: string = await commitmentOf(this.preimage(key, vote, salt, this.myIndex() as number), ':');
        this.sealStore.save(commitment, { key, vote, salt });
        this.room.transmitMessage(MGGameSessionType.COMMIT, { ...round, ...question, commitment });
    }

    /**
     * The time of the phase is over: the players it waits for missed it. The claim names the step of the phase: a claim of
     * a phase closed meanwhile is void
     */
    public claimTimeout(): void {
        this._sending.set(true);
        this.room.transmitMessage(MGGameSessionType.TIMEOUT, { ...this.round(), step: this.step() });
    }

    /** A player of the game over starts a new one */
    public rematch(): void {
        this._sending.set(true);
        this.room.transmitMessage(MGGameSessionType.REMATCH, { game: this._pastGames().length + 1 });
    }

    private get sealStore(): SealedStore<Seal> {
        this.seals ??= new SealedStore<Seal>('votes', this.room.roomName, this.room.localPlayer.name);
        return this.seals;
    }

    private get partStore(): SealedStore<string> {
        this.parts ??= new SealedStore<string>('draws', this.room.roomName, this.room.localPlayer.name);
        return this.parts;
    }

    private round(): MinorityRound {
        return { game: this._played().index, attempt: this._played().attempt };
    }

    private stepKey(): string {
        return `${ this._played().index }:${ this._played().attempt }:${ this.started() }:${ this.step() }`;
    }

    private questionKey(game: MinorityGameState): string {
        return keyOf({ round: game.round(), ask: game.ask() });
    }

    private indexOf(name: string): number | null {
        const index: number = this.players().indexOf(name);
        return index === -1 ? null : index;
    }

    /** The commitment to a vote: the game, the player, the question and the vote, with a salt */
    private preimage(key: string, vote: string, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        return [this._played().id(), 'vote', player, key, vote, salt];
    }

    private isRound(payload: MinorityRound): boolean {
        return payload.game === this._played().index && payload.attempt === this._played().attempt;
    }

    /** Whether a message names the question in progress of the game in progress */
    private isQuestion(game: MinorityGameState, payload: MinorityRound & QuestionKey): boolean {
        return this.isRound(payload) && payload.round === game.round() && payload.ask === game.ask();
    }

    private async apply(message: MinorityMessage): Promise<void> {
        // The move of the local player is in the chain: it may act again
        if (message.from === this.room.localPlayer.name && message.type !== MGGameSessionType.SEAT) {
            this._sending.set(false);
        }

        switch (message.type) {
            case MGGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case MGGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
            case MGGameSessionType.DRAW:
                await this.onDraw(message);
                break;
            case MGGameSessionType.QUESTION:
                this.onQuestion(message);
                break;
            case MGGameSessionType.COMMIT:
                this.onCommit(message);
                break;
            case MGGameSessionType.REVEAL:
                await this.onReveal(message);
                break;
            case MGGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case MGGameSessionType.REMATCH:
                this.onRematch(message.from, message.payload.game);
                break;
        }
        await this.drawAsker();
    }

    /**
     * A question waiting for its asker draws it from the seed of the game, before the next message applies: every page
     * draws the same asker, a page catching up included
     */
    private async drawAsker(): Promise<void> {
        const game: MinorityGameState | null = this.game();
        const draw: Readonly<AskerDraw> | null = game?.askerDraw() ?? null;

        if (game !== null && draw !== null) {
            game.appoint(await drawAsker(game.seed, draw));
        }
    }

    /**
     * A seated player starts the game with the seated players it names, 3 at least, and a setup the rules offer: a start
     * naming others is void, a seat changed meanwhile. Then each player commits to its random part, and reveals it once
     * every one committed
     */
    private async onDraw(message: AppMessage<MGGameSessionType.DRAW, MinorityDrawMessage>): Promise<void> {
        const { players, variant, voteTime, commitment, part } = message.payload;

        if (!this.isRound(message.payload)) {
            return;
        }
        if (players !== undefined) {
            this.open(message, players, { variant, voteTime });
            return;
        }
        if (!this.started() || this.game() !== null) {
            return;
        }

        const draw: FairDraw = this._played().draw as FairDraw;
        const step: DrawStep = part === undefined ? draw.commit(message.from, commitment) : await draw.reveal(message.from, part);
        if (step === DrawStep.INVALID) {
            this.room.reportCheat(message, part === undefined ? CheatReason.INVALID_MESSAGE : CheatReason.INVALID_REVEAL);
        }
        this._played().drew();

        const seed: string | undefined = await draw.seed();
        if (seed !== undefined) {
            // Every part is in the chain: a page reloaded draws the seed again from it
            this.partStore.remove(this._played().drawContext);
            this._played().start(new MinorityGameState(this.rules, draw.players.length, this._played().setup() as MinoritySetup, seed));
        }
    }

    /** The game starts with the seated players, the ones the start names: its draw opens, with the salts of the players */
    private open(message: AppMessage<MGGameSessionType.DRAW, MinorityDrawMessage>, players: unknown, setup: { variant: unknown; voteTime: unknown }): void {
        const seated: ReadonlyArray<Readonly<SeatedPlayer>> = this.tableSeats.taken();
        const names: ReadonlyArray<string> = seated.map((player: Readonly<SeatedPlayer>) => player.name);

        if (!isSetup(this.rules, setup)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (!this.started() && Array.isArray(players) && players.join('\n') === names.join('\n') && names.includes(message.from)
            && names.length >= this.rules.minPlayers) {
            this._played().open(seated, { variant: setup.variant, voteTime: setup.voteTime });
        }
    }

    /** The asker asks its question: a text the application would not send is reported, the asker still awaited */
    private onQuestion(message: AppMessage<MGGameSessionType.QUESTION, MinorityQuestionMessage>): void {
        const game: MinorityGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game === null || player === null || !this.isQuestion(game, message.payload)) {
            return;
        }
        if (!isQuestionText(message.payload.text)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (game.askQuestion(player, message.payload.text) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /** A player commits to its vote: the first commitment counts */
    private onCommit(message: AppMessage<MGGameSessionType.COMMIT, MinorityCommitMessage>): void {
        const game: MinorityGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { commitment } = message.payload;

        if (game === null || player === null || !this.isQuestion(game, message.payload)) {
            return;
        }
        if (!isCommitment(commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }

        const key: string = this.questionKey(game);
        const applied: Applied = game.commitVote(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        if (applied === Applied.APPLIED) {
            this.commitments.record(key, message.from, commitment);
            this.restore(message.from, commitment);
        }
    }

    /**
     * The vote of a commitment of the local player, kept in the tab: its page was reloaded, or sealed another vote meanwhile,
     * the first commitment in the chain counting
     */
    private restore(from: string, commitment: string): void {
        const stored: Readonly<Seal> | undefined = from === this.room.localPlayer.name ? this.sealStore.get(commitment) : undefined;

        if (stored !== undefined) {
            this._seals.update((seals: ReadonlyMap<string, Readonly<Seal>>) => new Map([...seals, [stored.key, stored]]));
        }
    }

    /**
     * A player reveals its vote: one not matching its commitment is reported, and withheld; one neither yes nor no is
     * reported, and withheld too
     */
    private async onReveal(message: AppMessage<MGGameSessionType.REVEAL, MinorityRevealMessage>): Promise<void> {
        const game: MinorityGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { vote, salt } = message.payload;

        if (game?.phase() !== MinorityPhase.REVEALING || player === null || !this.isQuestion(game, message.payload) || !game.awaited().includes(player)) {
            return;
        }

        const key: string = this.questionKey(game);
        const matching: boolean = typeof salt === 'string'
            && this.commitments.get(key, message.from) === await commitmentOf(this.preimage(key, typeof vote === 'string' ? vote : '', salt, player), ':');
        if (!matching) {
            this.room.reportCheat(message, CheatReason.INVALID_REVEAL);
            this.revealed(message.from, key);
            game.refuse(player);
            return;
        }

        this.revealed(message.from, key);
        if (game.revealVote(player, vote) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /** A vote of the local player revealed in the chain, refused or withheld: a reload does not need it anymore */
    private revealed(from: string, key: string): void {
        const commitment: string | undefined = this.commitments.get(key, from);
        if (from === this.room.localPlayer.name && commitment !== undefined) {
            this.sealStore.remove(commitment);
        }
    }

    /**
     * A player of the game, eliminated or not, tells the time of the phase is over, the first claim in the chain counting:
     * a claim naming a step past, or coming before the time of the phase on the time of the chain, is void. The draw of
     * the seed over, its late players lose their seats and the seats open again, for a new attempt; else they missed the
     * phase
     */
    private onTimeout(message: AppMessage<MGGameSessionType.TIMEOUT, MinorityTimeoutMessage>): void {
        // A room without the time of a chain can not tell a claim too early
        const at: number | undefined = this.room.sequencedAt(message);

        if (this.indexOf(message.from) === null || !this.started() || !this.isRound(message.payload) || message.payload.step !== this.step()
            || this.awaited().length === 0) {
            return;
        }
        if (at !== undefined && at - this.openedAt < (this.phaseTime() - CLAIM_SLACK) * 1000) {
            if (message.from === this.room.localPlayer.name) {
                this._voidedClaims.update((count: number) => count + 1);
            }
            return;
        }

        const game: MinorityGameState | null = this.game();
        if (game !== null) {
            if (game.phase() === MinorityPhase.REVEALING) {
                this.revealed(this.room.localPlayer.name, this.questionKey(game));
            }
            game.close();
            return;
        }

        // The part of the local player of a draw over: a reload does not need it anymore
        this.partStore.remove(this._played().drawContext);
        this.awaited().forEach((late: string) => this.tableSeats.free(this.tableSeats.seatOf(late) as number));
        this._played.set(new PlayedMinorityGame(this._played().index, this._played().attempt + 1));
    }

    /**
     * A seated player starts a new game once the former one is over, its seats open: the first request starts it, the
     * others name a game started already. The new game has its own setup, commitments and seals
     */
    private onRematch(from: string, game: number): void {
        if (this.tableSeats.seatOf(from) === null || !this.over() || game !== this._pastGames().length + 1) {
            return;
        }

        this._pastGames.update((games: ReadonlyArray<Readonly<PlayedMinorityGame>>) => [...games, this._played()]);
        this._played.set(new PlayedMinorityGame(game, 0));
        this.commitments = new SealedCommitments<string>();
        this._seals.set(new Map());
    }

    /**
     * What the local player owes the chain once the messages received are applied: its random part of the draw, its
     * commitment then its reveal, and the reveal of its vote. A page reloaded acts from its tab
     */
    private async act(): Promise<void> {
        const me: number | null = this.myIndex();
        const played: PlayedMinorityGame = this._played();
        const draw: FairDraw | null = played.draw;
        const game: MinorityGameState | null = this.game();

        if (me === null || draw === null) {
            return;
        }
        if (game === null) {
            await this.actOnDraw(draw, me);
            return;
        }

        if (game.phase() === MinorityPhase.REVEALING && game.awaited().includes(me)) {
            const key: string = this.questionKey(game);
            const seal: Readonly<Seal> | undefined = this._seals().get(key);
            const sent: string = `${ played.id() }:${ key }`;
            if (seal !== undefined && !this.sent.has(sent)) {
                this.sent.add(sent);
                this.room.transmitMessage(MGGameSessionType.REVEAL, { ...this.round(), round: game.round(), ask: game.ask(), vote: seal.vote, salt: seal.salt });
            }
        }
    }

    /** The local player commits to its part of the draw, then reveals it: its part kept in the tab */
    private async actOnDraw(draw: FairDraw, me: number): Promise<void> {
        const context: string = this._played().drawContext;
        const waiting: boolean = draw.waitingFor.includes(this.room.localPlayer.name);

        if (waiting && draw.phase === DrawPhase.COMMITTING && !this.sent.has(`draw:${ context }`)) {
            this.sent.add(`draw:${ context }`);
            // A page reloaded before its commitment came back commits to the same part again: the first one counts
            const part: string = this.partStore.get(context) ?? FairDraw.drawPart();
            this.partStore.save(context, part);
            this.room.transmitMessage(MGGameSessionType.DRAW, { ...this.round(), commitment: await FairDraw.commitment(context, me, part) });
        } else if (waiting && draw.phase === DrawPhase.REVEALING && !this.sent.has(`part:${ context }`)) {
            const part: string | undefined = this.partStore.get(context);
            if (part !== undefined) {
                this.sent.add(`part:${ context }`);
                this.room.transmitMessage(MGGameSessionType.DRAW, { ...this.round(), part });
            }
        }
    }
}
