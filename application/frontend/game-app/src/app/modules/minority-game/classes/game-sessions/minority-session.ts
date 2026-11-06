import { computed, Signal } from '@angular/core';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { GameRound } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { CommitRevealSession } from '@app/modules/commit-reveal/classes/commit-reveal-session';
import { CommitmentPart, drawSalt, isCommitment } from '@app/modules/commit-reveal/classes/commitment';
import { PlayedCommitRevealGame } from '@app/modules/commit-reveal/classes/played-commit-reveal-game';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { AskerDraw, drawAsker } from '../rules/asker';
import { MinorityGameState, MinorityPhase } from '../rules/minority-game-state';
import { isSetup, MINORITY_RULES, MinorityRules, MinoritySetup, Vote } from '../rules/minority-rules';
import { isQuestionText } from '../rules/question';
import {
    MGGameSessionType, MINORITY_TYPES, MinorityCommitMessage, MinorityDrawMessage, MinorityMessage, MinorityPayloads, MinorityQuestionMessage,
    MinorityRevealMessage, QuestionKey,
} from './minority-messages';

/** A game of the Minority Game in the room */
export type PlayedMinorityGame = PlayedCommitRevealGame<MinorityGameState, MinoritySetup>;

export interface MinoritySessionOptions {
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: MinorityRules;
}

/** A vote the local player committed to, kept to reveal it */
interface Seal {
    readonly vote: Vote;
    readonly salt: string;
}

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
export class MinoritySession extends CommitRevealSession<
    typeof MINORITY_TYPES, MinorityPayloads, MinorityDrawMessage, MinorityRules, MinorityGameState, MinoritySetup, PlayedMinorityGame, string, Seal
> {
    /** The setup of the game, once a player started it */
    public readonly setup: Signal<Readonly<MinoritySetup> | null> = computed((): Readonly<MinoritySetup> | null => this.played().setup());

    /** The local player was eliminated: it follows the game as a spectator */
    public readonly eliminated: Signal<boolean> = computed((): boolean => {
        const me: number | null = this.myIndex();
        return me !== null && this.game()?.eliminated().includes(me) === true;
    });
    /** The local player plays the game in progress, still in: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over() && !this.eliminated());

    /**
     * The players away who give the phase more time, once: every one, but the players a vote waits for gone since the
     * vote they missed, maybe for good (the score variant)
     */
    public readonly extendingAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const game: MinorityGameState | null = this.game();
        const gone: ReadonlySet<string> = new Set(game?.phase() === MinorityPhase.VOTING ? game.gone().map((player: number) => this.players()[player]) : []);
        return this.awaitedAway().filter((name: string) => !gone.has(name));
    });
    /** The asker of the question, once drawn */
    public readonly asker: Signal<string | null> = computed((): string | null => {
        const asker: number | null = this.game()?.asker() ?? null;
        return asker === null ? null : this.players()[asker];
    });

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

    public constructor(room: Room<MinorityPayloads>, options: MinoritySessionOptions = {}) {
        super(room, {
            rules: options.rules ?? MINORITY_RULES,
            types: MINORITY_TYPES,
            messages: Object.values(MGGameSessionType),
            sealKind: 'votes',
            played: (index: number, attempt: number): PlayedMinorityGame => new PlayedCommitRevealGame(index, attempt),
        });
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
        const question: Omit<MinorityCommitMessage, 'commitment'> = { ...this.round(), round: game.round(), ask: game.ask() };
        const key: string = keyOf(question);
        const salt: string = drawSalt();
        await this.seal(key, { vote, salt }, this.preimage(key, vote, salt, this.myIndex() as number),
            (commitment: string) => this.room.transmitMessage(MGGameSessionType.COMMIT, { ...question, commitment }));
    }

    protected override async apply(message: MinorityMessage): Promise<void> {
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

    /** As many players seated as the rules ask, at least */
    protected override enough(): boolean {
        return this.tableSeats.taken().length >= this.rules.minPlayers;
    }

    protected override setupOf({ variant, voteTime }: Readonly<MinorityDrawMessage>): Readonly<MinoritySetup> | undefined {
        const setup: { variant: unknown; voteTime: unknown } = { variant, voteTime };
        return isSetup(this.rules, setup) ? setup : undefined;
    }

    protected override openPlayed(seated: ReadonlyArray<Readonly<SeatedPlayer>>, setup: Readonly<MinoritySetup>): void {
        this.played().open(seated, setup);
    }

    /** The game: its seed draws the asker of each question */
    protected override drawGame(seed: string): Promise<MinorityGameState> {
        return Promise.resolve(new MinorityGameState(this.rules, this.players().length, this.setup() as MinoritySetup, seed));
    }

    /** The question of the votes, while they are revealed */
    protected override revealKey(game: MinorityGameState): string | null {
        return game.phase() === MinorityPhase.REVEALING ? this.questionKey(game) : null;
    }

    protected override transmitReveal(game: MinorityGameState, seal: Readonly<Seal>): void {
        this.room.transmitMessage(MGGameSessionType.REVEAL, { ...this.round(), round: game.round(), ask: game.ask(), vote: seal.vote, salt: seal.salt });
    }

    private questionKey(game: MinorityGameState): string {
        return keyOf({ round: game.round(), ask: game.ask() });
    }

    /** The commitment to a vote: the game, the player, the question and the vote, with a salt */
    private preimage(key: string, vote: string, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        return [this.played().id(), 'vote', player, key, vote, salt];
    }

    /** Whether a message names the question in progress of the game in progress */
    private isQuestion(game: MinorityGameState, payload: GameRound & QuestionKey): boolean {
        return this.isRound(payload) && payload.round === game.round() && payload.ask === game.ask();
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
        this.committed(this.applyCommit(message), keyOf(message.payload), message.from, message.payload.commitment);
    }

    /** Applies the commitment to the game, which ignores one too late or a second one, and refuses one of a player out */
    private applyCommit(message: AppMessage<MGGameSessionType.COMMIT, MinorityCommitMessage>): Applied {
        const game: MinorityGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game === null || player === null || !this.isQuestion(game, message.payload)) {
            return Applied.IGNORED;
        }
        if (!isCommitment(message.payload.commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return Applied.ILLEGAL;
        }

        const applied: Applied = game.commitVote(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        return applied;
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
        const matching: boolean = await this.opened(message, game, player, key, salt, (revealed: string) => this.preimage(key, typeof vote === 'string' ? vote : '', revealed, player));
        if (matching && game.revealVote(player, vote) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }
}
