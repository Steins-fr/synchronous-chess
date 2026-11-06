import { computed, Signal, signal } from '@angular/core';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { GameRound, TimeoutMessage } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { commitmentOf, CommitmentPart, drawSalt, isCommitment } from '@app/modules/commit-reveal/classes/commitment';
import { DrawPhase, DrawStep, FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SealedCommitments } from '@app/modules/commit-reveal/classes/sealed-commitments';
import { SealedStore } from '@app/modules/commit-reveal/classes/sealed-store';
import { SeatedPlayer, TableSeats } from '@app/modules/game-table/classes/table-seats';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { merge, Observable, Subject, Subscription } from 'rxjs';
import { ContrabandEvent, ContrabandEventKind, ContrabandGameState, ContrabandPhase } from '../rules/contraband-game-state';
import { Call, CONTRABAND_RULES, ContrabandRules, ContrabandSetup, isCall, isSetup, isTrunk, Team, teamOf } from '../rules/contraband-rules';
import { Crossing, drawSchedule } from '../rules/schedule';
import {
    CBGameSessionType, ContrabandCallMessage, ContrabandCommitMessage, ContrabandDrawMessage, ContrabandMessage, ContrabandPayloads, ContrabandRevealMessage,
    CrossingKey,
} from './contraband-messages';
import { PlayedContrabandGame } from './played-contraband-game';

export interface ContrabandSessionOptions {
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: ContrabandRules;
}

/** A trunk the local player committed to, kept to reveal it */
interface Seal {
    /** The game of the trunk in the match */
    readonly crossing: number;
    /** The money of the trunk, in millions: 0 for an iron bar */
    readonly amount: number;
    readonly salt: string;
}

/** The steps of the draw before the match: its commitments, then its reveals */
const DRAW_STEPS: number = 2;
/**
 * The seconds a claim of a timeout may come before the end of the time of its phase, on the time of the chain: the
 * clocks of the pages start once they receive the block opening the phase
 */
const CLAIM_SLACK: number = 2;
/** The keys of the titles of the conversations of a match, in the scope of the game */
const TEAM_TITLE: string = scopedKey(TranslationScope.CONTRABAND, marker('table.conversation.team', undefined, 'contraband'));
const CUSTOMS_TITLE: string = scopedKey(TranslationScope.CONTRABAND, marker('table.conversation.customs', undefined, 'contraband'));

/**
 * The Contraband in a room. The participants take the seats themselves, the seats 0 to 3 of the North, the others of the
 * South; a seated player starts the match once both countries hold as many players, one at least, with the variant, the
 * time of the customs and the games it picked: the seats are final until it is over. The players draw the seed of the
 * match at once, each one committing to a random part then revealing it: the seed draws the pairings of the games, alike
 * on every page. In each game, the smuggler commits to its trunk, the inspector of the other country calls, then the page
 * of the smuggler reveals the trunk by itself. No participant, the sequencer included, reads a trunk before the call.
 *
 * A phase closes as soon as its player acted, else once its time is over: a player claims it, the first claim in the
 * chain counting, and the player it waited for missed it. A claim coming before the time of the phase, on the time of
 * the chain, is void.
 */
export class ContrabandSession {
    public readonly rules: ContrabandRules = this.options.rules ?? CONTRABAND_RULES;

    private readonly _played = signal<PlayedContrabandGame>(new PlayedContrabandGame(0, 0));
    /** The match in progress, else the latest */
    public readonly played: Signal<PlayedContrabandGame> = this._played.asReadonly();
    private readonly _pastGames = signal<ReadonlyArray<Readonly<PlayedContrabandGame>>>([]);
    /** The matches over before the one in progress, the first one first */
    public readonly pastGames: Signal<ReadonlyArray<Readonly<PlayedContrabandGame>>> = this._pastGames.asReadonly();
    /** The match, once its seed is drawn */
    public readonly game: Signal<ContrabandGameState | null> = computed((): ContrabandGameState | null => this._played().game());
    /** The setup of the match, once a player started it */
    public readonly setup: Signal<Readonly<ContrabandSetup> | null> = computed((): Readonly<ContrabandSetup> | null => this._played().setup());

    private readonly _sending = signal<boolean>(false);
    /** A move of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();

    /** A player started the match: its players are final until it is over */
    public readonly started: Signal<boolean> = computed((): boolean => this._played().players().length > 0);
    public readonly over: Signal<boolean> = computed((): boolean => this._played().result() !== null);
    /** The seats are open until the match starts, and once it is over */
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => !this.started() || this.over());

    public readonly tableSeats = new TableSeats(this.room, {
        count: this.rules.seats,
        types: { seat: CBGameSessionType.SEAT, unseat: CBGameSessionType.UNSEAT },
        open: (): boolean => this.seatsOpen(),
        sending: this.sending,
    });
    /** The seated players not connected: the seats are the players of the match while it is played */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = this.tableSeats.awayPlayers;
    /** The players of the match, the seated ones in the order of their seats until it starts: the North ones first */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => this.started()
        ? this._played().players()
        : this.tableSeats.taken().map((player: Readonly<SeatedPlayer>) => player.name));
    /** The players of the North, the first ones: of the match once started, else the ones seated on the seats of the North */
    public readonly north: Signal<number> = computed((): number => this.started()
        ? this._played().north()
        : this.tableSeats.seated().slice(0, this.rules.teamSeats).filter((player: Readonly<SeatedPlayer> | null) => player !== null).length);
    /** The index of the local player among the players, none for a spectator */
    public readonly myIndex: Signal<number | null> = computed((): number | null => this.indexOf(this.room.localPlayer.name));
    /** The country of the local player, none for a spectator */
    public readonly myTeam: Signal<Team | null> = computed((): Team | null => {
        const me: number | null = this.myIndex();
        return me === null ? null : teamOf(me, this.north());
    });
    /** The local player plays the match in progress: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over());

    /** The players the match waits for: to draw the seed, then to act in each phase */
    public readonly awaited: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const game: ContrabandGameState | null = this.game();
        if (game === null) {
            return this._played().drawWaitingFor();
        }
        return game.awaited().map((player: number) => this.players()[player]);
    });
    /** The players the match waits for who are away */
    public readonly awaitedAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const away: ReadonlyArray<string> = this.awayPlayers();
        return this.awaited().filter((name: string) => away.includes(name));
    });
    /** The players away who give the phase more time, once: every one, but the players absent since the phase they missed */
    public readonly extendingAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const absent: ReadonlySet<string> = new Set((this.game()?.absent() ?? []).map((player: number) => this.players()[player]));
        return this.awaitedAway().filter((name: string) => !absent.has(name));
    });
    /** The smuggler of the game, once the seed is drawn */
    public readonly smuggler: Signal<string | null> = computed((): string | null => {
        const game: ContrabandGameState | null = this.game();
        return game === null ? null : this.players()[game.smuggler()];
    });
    /** The inspector of the game, once the seed is drawn */
    public readonly inspector: Signal<string | null> = computed((): string | null => {
        const game: ContrabandGameState | null = this.game();
        return game === null ? null : this.players()[game.inspector()];
    });
    /** The phases of the match: a claim of a timeout names it, a move closing the phase meanwhile voids it */
    public readonly step: Signal<number> = computed((): number => {
        const game: ContrabandGameState | null = this.game();
        return game === null ? Number(this._played().drawPhase() === DrawPhase.REVEALING) : DRAW_STEPS + game.step();
    });
    /** The seconds of the phase in progress */
    public readonly phaseTime: Signal<number> = computed((): number => this.game()?.phaseTime() ?? this.rules.drawTime);

    /** Whether the local player may start the match: seated, both countries of the same size, none started */
    public readonly canStart: Signal<boolean> = computed((): boolean => !this._sending() && !this.started()
        && this.tableSeats.mySeat() !== null && this.balanced());
    /** Whether the local player may pack its trunk: the smuggler of the game, not committed yet */
    public readonly canPack: Signal<boolean> = computed((): boolean => {
        const game: ContrabandGameState | null = this.game();
        return !this._sending() && game?.phase() === ContrabandPhase.PACKING && game.smuggler() === this.myIndex();
    });
    /** Whether the local player may call: the inspector of the game, the customs open */
    public readonly canCall: Signal<boolean> = computed((): boolean => {
        const game: ContrabandGameState | null = this.game();
        return !this._sending() && game?.phase() === ContrabandPhase.CUSTOMS && game.inspector() === this.myIndex();
    });
    /** The money left in the ATM of the local player, none for a spectator or before the seed is drawn */
    public readonly myAtm: Signal<number | null> = computed((): number | null => {
        const me: number | null = this.myIndex();
        return me === null ? null : this.game()?.atms()[me] ?? null;
    });

    private readonly _seals = signal<ReadonlyMap<number, Readonly<Seal>>>(new Map());
    /**
     * The money of the trunk of the local player, the smuggler of the game, sealed: once packed, until the game is
     * settled. Only its page knows it until its reveal
     */
    public readonly myTrunk: Signal<number | null> = computed((): number | null => {
        const game: ContrabandGameState | null = this.game();

        if (game === null || game.phase() === ContrabandPhase.OVER || game.smuggler() !== this.myIndex()) {
            return null;
        }
        return this._seals().get(game.crossing())?.amount ?? null;
    });

    /**
     * The private conversations of the match, the same on every page: one for each country of 2 players or more, open
     * until the match is over, and one for the customs of each game packed, between its smuggler and its inspector, open
     * while the inspector calls. A spectator is a member of none
     */
    public readonly conversations: Signal<ReadonlyArray<Readonly<PrivateConversation>>> = computed((): ReadonlyArray<Readonly<PrivateConversation>> => {
        const played: PlayedContrabandGame = this._played();
        const game: ContrabandGameState | null = this.game();
        const players: ReadonlyArray<string> = played.players();
        const prefix: string = `cb-${ played.index }-${ played.attempt }`;
        const countries: ReadonlyArray<Readonly<PrivateConversation>> = [Team.NORTH, Team.SOUTH]
            .map((team: Team): Readonly<PrivateConversation> => ({
                id: `${ prefix }-${ team }`,
                members: players.filter((_, player: number) => teamOf(player, played.north()) === team),
                title: { key: TEAM_TITLE, params: { team } },
                open: !this.over(),
            }))
            .filter((conversation: Readonly<PrivateConversation>) => conversation.members.length >= 2);
        if (game === null) {
            return countries;
        }

        const customs: ReadonlyArray<Readonly<PrivateConversation>> = game.events()
            .filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.PACKED)
            .map(({ crossing, smuggler, inspector }: Readonly<ContrabandEvent>): Readonly<PrivateConversation> => ({
                id: `${ prefix }-customs-${ crossing }`,
                members: [players[smuggler], players[inspector]],
                title: { key: CUSTOMS_TITLE, params: { number: crossing + 1, smuggler: players[smuggler], inspector: players[inspector] } },
                open: game.phase() === ContrabandPhase.CUSTOMS && game.crossing() === crossing,
            }));
        return [...countries, ...customs];
    });

    private readonly _voidedClaims = signal<number>(0);
    /** The claims of the local player voided as too early: its clock waits again */
    public readonly voidedClaims: Signal<number> = this._voidedClaims.asReadonly();
    // The session applied a live message: it caught up with the history of the room
    private live: boolean = false;
    private readonly _caughtUp = new Subject<void>();
    /** Emits once, right before the first live message applies: the table shows the history at once */
    public readonly caughtUp: Observable<void> = this._caughtUp.asObservable();

    /** The commitments of the match in progress, by game */
    private commitments = new SealedCommitments<number>();
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

    public constructor(private readonly room: Room<ContrabandPayloads>, private readonly options: ContrabandSessionOptions = {}) {
        this.subscription = merge(...Object.values(CBGameSessionType).map((type: CBGameSessionType) => room.messenger(type)))
            .subscribe((message: ContrabandMessage) => {
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

    /** The local player starts the match with the seated players and its setup: then each one commits to its part of the draw */
    public start(setup: Readonly<ContrabandSetup>): void {
        if (this.canStart() && isSetup(this.rules, setup)) {
            this._sending.set(true);
            this.room.transmitMessage(CBGameSessionType.DRAW, {
                ...this.round(), players: this.players(), north: this.north(), variant: setup.variant, customsTime: setup.customsTime, games: setup.games,
            });
        }
    }

    /** The smuggler packs its trunk: sealed until the inspector called */
    public async pack(amount: number): Promise<void> {
        const game: ContrabandGameState | null = this.game();
        if (game === null || !this.canPack() || !isTrunk(this.rules, game.variant, this.myAtm() as number, amount)) {
            return;
        }

        // The game of the trunk, fixed before the hash: a timeout applied meanwhile moves to the next game
        const crossing: number = game.crossing();
        const round: GameRound = this.round();
        const salt: string = drawSalt();
        this._sending.set(true);
        this._seals.update((seals: ReadonlyMap<number, Readonly<Seal>>) => new Map([...seals, [crossing, { crossing, amount, salt }]]));
        const commitment: string = await commitmentOf(this.preimage(crossing, amount, salt, this.myIndex() as number), ':');
        this.sealStore.save(commitment, { crossing, amount, salt });
        this.room.transmitMessage(CBGameSessionType.COMMIT, { ...round, crossing, commitment });
    }

    /** The inspector calls: a pass, a doubt or a check, as the variant offers */
    public call(call: Call): void {
        const game: ContrabandGameState | null = this.game();

        if (game !== null && this.canCall() && isCall(this.rules, game.variant, call)) {
            this._sending.set(true);
            this.room.transmitMessage(CBGameSessionType.CALL, { ...this.round(), crossing: game.crossing(), call });
        }
    }

    /**
     * The time of the phase is over: the player it waits for missed it. The claim names the step of the phase: a claim of
     * a phase closed meanwhile is void
     */
    public claimTimeout(): void {
        this._sending.set(true);
        this.room.transmitMessage(CBGameSessionType.TIMEOUT, { ...this.round(), step: this.step() });
    }

    /** A player of the match over starts a new one */
    public rematch(): void {
        this._sending.set(true);
        this.room.transmitMessage(CBGameSessionType.REMATCH, { game: this._pastGames().length + 1 });
    }

    private get sealStore(): SealedStore<Seal> {
        this.seals ??= new SealedStore<Seal>('trunks', this.room.roomName, this.room.localPlayer.name);
        return this.seals;
    }

    private get partStore(): SealedStore<string> {
        this.parts ??= new SealedStore<string>('draws', this.room.roomName, this.room.localPlayer.name);
        return this.parts;
    }

    /** Both countries hold as many players, enough */
    private balanced(): boolean {
        return this.north() >= this.rules.minTeam && this.players().length === 2 * this.north();
    }

    private round(): GameRound {
        return { game: this._played().index, attempt: this._played().attempt };
    }

    private stepKey(): string {
        return `${ this._played().index }:${ this._played().attempt }:${ this.started() }:${ this.step() }`;
    }

    private indexOf(name: string): number | null {
        const index: number = this.players().indexOf(name);
        return index === -1 ? null : index;
    }

    /** The commitment to a trunk: the match, the player, the game and the money, with a salt */
    private preimage(crossing: number, amount: number | string, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        return [this._played().id(), 'trunk', player, crossing, amount, salt];
    }

    private isRound(payload: GameRound): boolean {
        return payload.game === this._played().index && payload.attempt === this._played().attempt;
    }

    /** Whether a message names the game in progress of the match in progress */
    private isCrossing(game: ContrabandGameState, payload: GameRound & CrossingKey): boolean {
        return this.isRound(payload) && payload.crossing === game.crossing();
    }

    private async apply(message: ContrabandMessage): Promise<void> {
        // The move of the local player is in the chain: it may act again
        if (message.from === this.room.localPlayer.name && message.type !== CBGameSessionType.SEAT) {
            this._sending.set(false);
        }

        switch (message.type) {
            case CBGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case CBGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
            case CBGameSessionType.DRAW:
                await this.onDraw(message);
                break;
            case CBGameSessionType.COMMIT:
                this.onCommit(message);
                break;
            case CBGameSessionType.CALL:
                this.onCall(message);
                break;
            case CBGameSessionType.REVEAL:
                await this.onReveal(message);
                break;
            case CBGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case CBGameSessionType.REMATCH:
                this.onRematch(message.from, message.payload.game);
                break;
        }
    }

    /**
     * A seated player starts the match with the seated players and the countries it names, of the same size, and a setup
     * the rules offer: a start naming others is void, a seat changed meanwhile. Then each player commits to its random
     * part, and reveals it once every one committed: the seed draws the pairings of the games, before the next message
     * applies, alike on every page, a page catching up included
     */
    private async onDraw(message: AppMessage<CBGameSessionType.DRAW, ContrabandDrawMessage>): Promise<void> {
        const { players, north, variant, customsTime, games, commitment, part } = message.payload;

        if (!this.isRound(message.payload)) {
            return;
        }
        if (players !== undefined) {
            this.open(message, players, north, { variant, customsTime, games });
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
            const setup: Readonly<ContrabandSetup> = this._played().setup() as ContrabandSetup;
            const schedule: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(seed, this._played().north(), setup.games);
            this._played().start(new ContrabandGameState(this.rules, this._played().north(), setup, schedule));
        }
    }

    /** The match starts with the seated players, the ones the start names: its draw opens, with the salts of the players */
    private open(
        message: AppMessage<CBGameSessionType.DRAW, ContrabandDrawMessage>, players: unknown, north: unknown,
        setup: { variant: unknown; customsTime: unknown; games: unknown },
    ): void {
        const seated: ReadonlyArray<Readonly<SeatedPlayer>> = this.tableSeats.taken();
        const names: ReadonlyArray<string> = seated.map((player: Readonly<SeatedPlayer>) => player.name);

        if (!isSetup(this.rules, setup)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (!this.started() && Array.isArray(players) && players.join('\n') === names.join('\n') && names.includes(message.from)
            && north === this.north() && this.balanced()) {
            this._played().openMatch(seated, this.north(), { variant: setup.variant, customsTime: setup.customsTime, games: setup.games });
        }
    }

    /** The smuggler commits to its trunk: the first commitment counts, the customs open */
    private onCommit(message: AppMessage<CBGameSessionType.COMMIT, ContrabandCommitMessage>): void {
        const applied: Applied = this.applyCommit(message);

        // A commitment of the local player the match did not take, too late or a second one: its seal is of no use. The one
        // taken, delivered again, keeps its seal
        const { crossing, commitment } = message.payload;
        if (applied !== Applied.APPLIED && message.from === this.room.localPlayer.name && this.commitments.get(crossing, message.from) !== commitment) {
            this.sealStore.remove(commitment);
        }
    }

    /** Applies the commitment to the match, which ignores one out of the packing or a second one, and refuses one of another player */
    private applyCommit(message: AppMessage<CBGameSessionType.COMMIT, ContrabandCommitMessage>): Applied {
        const game: ContrabandGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { crossing, commitment } = message.payload;

        if (game === null || player === null || !this.isCrossing(game, message.payload)) {
            return Applied.IGNORED;
        }
        if (!isCommitment(commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return Applied.ILLEGAL;
        }

        const applied: Applied = game.pack(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        if (applied === Applied.APPLIED) {
            this.commitments.record(crossing, message.from, commitment);
            this.restore(message.from, commitment);
        }
        return applied;
    }

    /**
     * The trunk of a commitment of the local player, kept in the tab: its page was reloaded, or sealed another trunk
     * meanwhile, the first commitment in the chain counting
     */
    private restore(from: string, commitment: string): void {
        const stored: Readonly<Seal> | undefined = from === this.room.localPlayer.name ? this.sealStore.get(commitment) : undefined;

        if (stored !== undefined) {
            this._seals.update((seals: ReadonlyMap<number, Readonly<Seal>>) => new Map([...seals, [stored.crossing, stored]]));
        }
    }

    /** The inspector calls: a call the variant does not offer is reported, the inspector still awaited */
    private onCall(message: AppMessage<CBGameSessionType.CALL, ContrabandCallMessage>): void {
        const game: ContrabandGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game?.phase() !== ContrabandPhase.CUSTOMS || player === null || !this.isCrossing(game, message.payload)) {
            return;
        }
        if (!isCall(this.rules, game.variant, message.payload.call)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (game.call(player, message.payload.call) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /**
     * The smuggler reveals its trunk: one not matching its commitment is reported, and seized as withheld; one the rules
     * do not allow is reported, and seized as withheld too
     */
    private async onReveal(message: AppMessage<CBGameSessionType.REVEAL, ContrabandRevealMessage>): Promise<void> {
        const game: ContrabandGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { crossing, amount, salt } = message.payload;

        if (game?.phase() !== ContrabandPhase.REVEALING || player === null || !this.isCrossing(game, message.payload) || !game.awaited().includes(player)) {
            return;
        }

        const matching: boolean = typeof salt === 'string'
            && this.commitments.get(crossing, message.from) === await commitmentOf(this.preimage(crossing, typeof amount === 'number' ? amount : '', salt, player), ':');
        this.revealed(message.from, crossing);
        if (!matching) {
            this.room.reportCheat(message, CheatReason.INVALID_REVEAL);
            game.refuse(player);
            return;
        }
        if (game.reveal(player, amount) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /** A trunk of the local player revealed in the chain, refused or withheld: a reload does not need it anymore */
    private revealed(from: string, crossing: number): void {
        const commitment: string | undefined = this.commitments.get(crossing, from);
        if (from === this.room.localPlayer.name && commitment !== undefined) {
            this.sealStore.remove(commitment);
        }
    }

    /**
     * A player of the match tells the time of the phase is over, the first claim in the chain counting: a claim naming a
     * step past, or coming before the time of the phase on the time of the chain, is void. The draw of the seed over, its
     * late players lose their seats and the seats open again, for a new attempt; else the player late missed the phase
     */
    private onTimeout(message: AppMessage<CBGameSessionType.TIMEOUT, TimeoutMessage>): void {
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

        const game: ContrabandGameState | null = this.game();
        if (game !== null) {
            if (game.phase() === ContrabandPhase.REVEALING) {
                this.revealed(this.room.localPlayer.name, game.crossing());
            }
            game.close();
            return;
        }

        // The part of the local player of a draw over: a reload does not need it anymore
        this.partStore.remove(this._played().drawContext);
        this.awaited().forEach((late: string) => this.tableSeats.free(this.tableSeats.seatOf(late) as number));
        this._played.set(new PlayedContrabandGame(this._played().index, this._played().attempt + 1));
    }

    /**
     * A seated player starts a new match once the former one is over, its seats open: the first request starts it, the
     * others name a match started already. The new match has its own setup, countries, commitments and seals
     */
    private onRematch(from: string, game: number): void {
        if (this.tableSeats.seatOf(from) === null || !this.over() || game !== this._pastGames().length + 1) {
            return;
        }

        this._pastGames.update((games: ReadonlyArray<Readonly<PlayedContrabandGame>>) => [...games, this._played()]);
        this._played.set(new PlayedContrabandGame(game, 0));
        this.commitments = new SealedCommitments<number>();
        this._seals.set(new Map());
        // No trunk of the new match is sealed yet: the seals left of a match over in the history of a page reloaded go
        if (this.live) {
            this.sealStore.clear();
        }
    }

    /**
     * What the local player owes the chain once the messages received are applied: its random part of the draw, its
     * commitment then its reveal, and the reveal of its trunk once called. A page reloaded acts from its tab
     */
    private async act(): Promise<void> {
        const me: number | null = this.myIndex();
        const played: PlayedContrabandGame = this._played();
        const draw: FairDraw | null = played.draw;
        const game: ContrabandGameState | null = this.game();

        if (me === null || draw === null) {
            return;
        }
        if (game === null) {
            await this.actOnDraw(draw, me);
            return;
        }
        // The match over live, no trunk is to reveal: the seal of a commitment lost on its way goes too. Not while the page
        // catches up, a match over of the history before the match in progress
        if (this.live && game.phase() === ContrabandPhase.OVER) {
            this.sealStore.clear();
        }

        if (game.phase() === ContrabandPhase.REVEALING && game.awaited().includes(me)) {
            const crossing: number = game.crossing();
            const seal: Readonly<Seal> | undefined = this._seals().get(crossing);
            const sent: string = `${ played.id() }:${ crossing }`;
            if (seal !== undefined && !this.sent.has(sent)) {
                this.sent.add(sent);
                this.room.transmitMessage(CBGameSessionType.REVEAL, { ...this.round(), crossing, amount: seal.amount, salt: seal.salt });
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
            this.room.transmitMessage(CBGameSessionType.DRAW, { ...this.round(), commitment: await FairDraw.commitment(context, me, part) });
        } else if (waiting && draw.phase === DrawPhase.REVEALING && !this.sent.has(`part:${ context }`)) {
            const part: string | undefined = this.partStore.get(context);
            if (part !== undefined) {
                this.sent.add(`part:${ context }`);
                this.room.transmitMessage(CBGameSessionType.DRAW, { ...this.round(), part });
            }
        }
    }
}
