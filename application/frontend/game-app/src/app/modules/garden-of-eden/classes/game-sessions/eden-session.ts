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
import { EdenGameState, EdenPhase } from '../rules/eden-game-state';
import { Apple, EDEN_RULES, EdenRules, EdenSetup, isSetup } from '../rules/eden-rules';
import {
    EDEN_TYPES, EdenCommitMessage, EdenDrawMessage, EdenMessage, EdenPayloads, EdenRevealMessage, GEGameSessionType, RoundKey,
} from './eden-messages';

/** A game of the Garden of Eden in the room */
export type PlayedEdenGame = PlayedCommitRevealGame<EdenGameState, EdenSetup>;

export interface EdenSessionOptions {
    /** The rules of the game: the ones of the film by default */
    readonly rules?: EdenRules;
}

/** An apple the local player committed to, kept to reveal it */
interface Seal {
    readonly apple: Apple;
    readonly salt: string;
}

/**
 * The Garden of Eden in a room. The participants take the seats themselves; a seated player starts the game once 3
 * players or more are seated, with the time of a vote and the starting money it picked: the seats are final until it is
 * over. The players draw the seed of the game at once, as every game committing then revealing its moves, a seed this
 * game does not use. Then, each round, the players still in paradise vote at the same time: each one commits to its
 * apple, and reveals it once every voter committed. No participant, the sequencer included, reads an apple before the
 * vote is closed.
 *
 * A phase closes as soon as every player it waits for acted, else once its time is over: a player claims it, the first
 * claim in the chain counting, and the players it waited for missed it. A claim coming before the time of the phase, on
 * the time of the chain, is void.
 */
export class EdenSession extends CommitRevealSession<
    typeof EDEN_TYPES, EdenPayloads, EdenDrawMessage, EdenRules, EdenGameState, EdenSetup, PlayedEdenGame, number, Seal
> {
    /** The setup of the game, once a player started it */
    public readonly setup: Signal<Readonly<EdenSetup> | null> = computed((): Readonly<EdenSetup> | null => this.played().setup());

    /** The local player lost paradise: it follows the game as a spectator */
    public readonly lostParadise: Signal<boolean> = computed((): boolean => {
        const me: number | null = this.myIndex();
        return me !== null && this.game()?.out().includes(me) === true;
    });
    /** The local player plays the game in progress, still in paradise: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over() && !this.lostParadise());

    /** The players away who give the phase more time, once: every one, but the players absent since a phase they missed */
    public readonly extendingAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const absent: ReadonlySet<string> = new Set((this.game()?.absent() ?? []).map((player: number) => this.players()[player]));
        return this.awaitedAway().filter((name: string) => !absent.has(name));
    });

    /** Whether the local player may vote: still in paradise, not committed yet */
    public readonly canVote: Signal<boolean> = computed((): boolean => {
        const game: EdenGameState | null = this.game();
        const me: number | null = this.myIndex();
        return !this._sending() && me !== null && game?.phase() === EdenPhase.VOTING && game.inPlay().includes(me) && !game.committed().includes(me);
    });

    /**
     * The apple of the local player on the round, sealed until the apples are revealed. Once the vote closed, the game
     * counts it only when its commitment came in time: sent as the time ran out, it is no apple
     */
    public readonly myApple: Signal<Apple | null> = computed((): Apple | null => {
        const game: EdenGameState | null = this.game();
        const me: number | null = this.myIndex();
        const revealing: boolean = game?.phase() === EdenPhase.REVEALING && me !== null && game.committed().includes(me);

        if (game === null || (game.phase() !== EdenPhase.VOTING && !revealing)) {
            return null;
        }
        return this._seals().get(game.round())?.apple ?? null;
    });

    public constructor(room: Room<EdenPayloads>, options: EdenSessionOptions = {}) {
        super(room, {
            rules: options.rules ?? EDEN_RULES,
            types: EDEN_TYPES,
            messages: Object.values(GEGameSessionType),
            sealKind: 'apples',
            played: (index: number, attempt: number): PlayedEdenGame => new PlayedCommitRevealGame(index, attempt),
        });
    }

    /** The local player starts the game with the seated players and its setup: then each one commits to its part of the draw */
    public start(setup: Readonly<EdenSetup>): void {
        if (this.canStart() && isSetup(this.rules, setup)) {
            this._sending.set(true);
            this.room.transmitMessage(GEGameSessionType.DRAW, { ...this.round(), players: this.players(), voteTime: setup.voteTime, startMoney: setup.startMoney });
        }
    }

    /** The local player votes for an apple: sealed until the vote closes */
    public async vote(apple: Apple): Promise<void> {
        const game: EdenGameState | null = this.game();
        if (game === null || !this.canVote()) {
            return;
        }

        // The round of the vote, fixed before the hash: a timeout applied meanwhile moves to the next round
        const round: number = game.round();
        const salt: string = drawSalt();
        await this.seal(round, { apple, salt }, this.preimage(round, apple, salt, this.myIndex() as number),
            (commitment: string) => this.room.transmitMessage(GEGameSessionType.COMMIT, { ...this.round(), round, commitment }));
    }

    protected override async apply(message: EdenMessage): Promise<void> {
        switch (message.type) {
            case GEGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case GEGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
            case GEGameSessionType.DRAW:
                await this.onDraw(message);
                break;
            case GEGameSessionType.COMMIT:
                this.onCommit(message);
                break;
            case GEGameSessionType.REVEAL:
                await this.onReveal(message);
                break;
            case GEGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case GEGameSessionType.REMATCH:
                this.onRematch(message.from, message.payload.game);
                break;
        }
    }

    /** As many players seated as the rules ask, at least */
    protected override enough(): boolean {
        return this.tableSeats.taken().length >= this.rules.minPlayers;
    }

    protected override setupOf({ voteTime, startMoney }: Readonly<EdenDrawMessage>): Readonly<EdenSetup> | undefined {
        const setup: { voteTime: unknown; startMoney: unknown } = { voteTime, startMoney };
        return isSetup(this.rules, setup) ? setup : undefined;
    }

    protected override openPlayed(seated: ReadonlyArray<Readonly<SeatedPlayer>>, setup: Readonly<EdenSetup>): void {
        this.played().open(seated, setup);
    }

    /** The game: it draws nothing, its seed unused */
    protected override drawGame(): Promise<EdenGameState> {
        return Promise.resolve(new EdenGameState(this.rules, this.players().length, this.setup() as EdenSetup));
    }

    /** The round of the apples, while they are revealed */
    protected override revealKey(game: EdenGameState): number | null {
        return game.phase() === EdenPhase.REVEALING ? game.round() : null;
    }

    protected override transmitReveal(game: EdenGameState, seal: Readonly<Seal>): void {
        this.room.transmitMessage(GEGameSessionType.REVEAL, { ...this.round(), round: game.round(), apple: seal.apple, salt: seal.salt });
    }

    /** The commitment to an apple: the game, the player, the round and the apple, with a salt */
    private preimage(round: number, apple: string, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        return [this.played().id(), 'apple', player, round, apple, salt];
    }

    /** Whether a message names the round in progress of the game in progress */
    private isVote(game: EdenGameState, payload: GameRound & RoundKey): boolean {
        return this.isRound(payload) && payload.round === game.round();
    }

    /** A player commits to its apple: the first commitment counts */
    private onCommit(message: AppMessage<GEGameSessionType.COMMIT, EdenCommitMessage>): void {
        this.committed(this.applyCommit(message), message.payload.round, message.from, message.payload.commitment);
    }

    /** Applies the commitment to the game, which ignores one too late or a second one, and refuses one of a player out of paradise */
    private applyCommit(message: AppMessage<GEGameSessionType.COMMIT, EdenCommitMessage>): Applied {
        const game: EdenGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game === null || player === null || !this.isVote(game, message.payload)) {
            return Applied.IGNORED;
        }
        if (!isCommitment(message.payload.commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return Applied.ILLEGAL;
        }

        const applied: Applied = game.commitApple(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        return applied;
    }

    /**
     * A player reveals its apple: one not matching its commitment is reported, and withheld; one that is no apple is
     * reported, and withheld too
     */
    private async onReveal(message: AppMessage<GEGameSessionType.REVEAL, EdenRevealMessage>): Promise<void> {
        const game: EdenGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { apple, salt } = message.payload;

        if (game?.phase() !== EdenPhase.REVEALING || player === null || !this.isVote(game, message.payload) || !game.awaited().includes(player)) {
            return;
        }

        const round: number = game.round();
        const matching: boolean = await this.opened(message, game, player, round, salt,
            (revealed: string) => this.preimage(round, typeof apple === 'string' ? apple : '', revealed, player));
        if (matching && game.revealApple(player, apple) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }
}
