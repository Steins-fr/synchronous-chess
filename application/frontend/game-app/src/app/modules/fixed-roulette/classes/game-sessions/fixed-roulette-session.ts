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
import { drawCroupier } from '../rules/croupier';
import { FixedRouletteGameState, FixedRoulettePhase } from '../rules/fixed-roulette-game-state';
import {
    Bets, FIXED_ROULETTE_RULES, FixedRouletteRules, FixedRouletteSetup, isBets, isCroupierBet, isPocket, isPunterBet, isSetup, Side, sideOf, totalOf,
} from '../rules/fixed-roulette-rules';
import {
    FIXED_ROULETTE_TYPES, FixedRouletteBetMessage, FixedRouletteCommitMessage, FixedRouletteDrawMessage, FixedRouletteMessage, FixedRoulettePayloads,
    FixedRouletteRevealMessage, FRGameSessionType, RoundKey,
} from './fixed-roulette-messages';

/** A match of the Fixed Roulette in the room */
export type PlayedFixedRouletteGame = PlayedCommitRevealGame<FixedRouletteGameState, FixedRouletteSetup>;

export interface FixedRouletteSessionOptions {
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: FixedRouletteRules;
}

/** A ball the local player, the croupier of a game, committed to, kept to reveal it */
interface Seal {
    /** The pocket of the ball, numbered from 1 */
    readonly pocket: number;
    readonly salt: string;
}

/**
 * The Fixed Roulette in a room: a duel on a wheel of 4 pockets that does not spin. The participants take the two seats
 * themselves; a seated player starts the match once both seats are taken, with the time of the bets it picked: the seats
 * are final until it is over. The players draw the seed of the match at once, each one committing to a random part then
 * revealing it: the seed draws the croupier of the first game, alike on every page, then the players swap their roles each
 * game. In each game, the croupier commits to the pocket of the ball and bets in public in one message, the punter bets,
 * then the page of the croupier reveals the ball by itself. No participant, the sequencer included, reads the ball before
 * the punter bet.
 *
 * A move out of its phase is ignored by every page, a move of the other player in its phase reported. A phase closes as
 * soon as its player acted, else once its time is over: a player claims it, the first claim in the chain counting, and
 * the player it waited for forfeits the match. A claim coming before the time of the phase, on the time of the chain, is
 * void.
 */
export class FixedRouletteSession extends CommitRevealSession<
    typeof FIXED_ROULETTE_TYPES, FixedRoulettePayloads, FixedRouletteDrawMessage, FixedRouletteRules, FixedRouletteGameState, FixedRouletteSetup,
    PlayedFixedRouletteGame, number, Seal
> {
    /** The setup of the match, once a player started it */
    public readonly setup: Signal<Readonly<FixedRouletteSetup> | null> = computed((): Readonly<FixedRouletteSetup> | null => this.played().setup());

    /** The local player plays the match in progress: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over());

    /** The croupier of the game, once the seed is drawn */
    public readonly croupier: Signal<string | null> = computed((): string | null => {
        const game: FixedRouletteGameState | null = this.game();
        return game === null ? null : this.players()[game.croupier()];
    });
    /** The punter of the game, once the seed is drawn */
    public readonly punter: Signal<string | null> = computed((): string | null => {
        const game: FixedRouletteGameState | null = this.game();
        return game === null ? null : this.players()[game.punter()];
    });
    /** The role of the local player in the game, none for a spectator or before the seed is drawn */
    public readonly mySide: Signal<Side | null> = computed((): Side | null => {
        const me: number | null = this.myIndex();
        const game: FixedRouletteGameState | null = this.game();
        return me === null || game === null ? null : sideOf(me, game.croupier());
    });
    /** The chips the local player holds off the table, none for a spectator or before the seed is drawn */
    public readonly myChips: Signal<number | null> = computed((): number | null => {
        const me: number | null = this.myIndex();
        return me === null ? null : this.game()?.chips()[me] ?? null;
    });

    /** Whether the local player may place the ball and bet: the croupier of the game, not committed yet */
    public readonly canPlace: Signal<boolean> = computed((): boolean => {
        const game: FixedRouletteGameState | null = this.game();
        return !this._sending() && game?.phase() === FixedRoulettePhase.PLACING && game.croupier() === this.myIndex();
    });
    /** Whether the local player may bet: the punter of the game, once the croupier bet */
    public readonly canBet: Signal<boolean> = computed((): boolean => {
        const game: FixedRouletteGameState | null = this.game();
        return !this._sending() && game?.phase() === FixedRoulettePhase.BETTING && game.punter() === this.myIndex();
    });

    /**
     * The pocket of the ball of the local player, the croupier of the game, sealed: once placed, until the game is settled.
     * Only its page knows it until its reveal
     */
    public readonly myBall: Signal<number | null> = computed((): number | null => {
        const game: FixedRouletteGameState | null = this.game();

        if (game === null || game.phase() === FixedRoulettePhase.OVER || game.croupier() !== this.myIndex()) {
            return null;
        }
        return this._seals().get(game.round())?.pocket ?? null;
    });

    public constructor(room: Room<FixedRoulettePayloads>, options: FixedRouletteSessionOptions = {}) {
        super(room, {
            rules: options.rules ?? FIXED_ROULETTE_RULES,
            types: FIXED_ROULETTE_TYPES,
            messages: Object.values(FRGameSessionType),
            sealKind: 'balls',
            played: (index: number, attempt: number): PlayedFixedRouletteGame => new PlayedCommitRevealGame(index, attempt),
        });
    }

    /** The local player starts the match with the seated players and its setup: then each one commits to its part of the draw */
    public start(setup: Readonly<FixedRouletteSetup>): void {
        if (this.canStart() && isSetup(this.rules, setup)) {
            this._sending.set(true);
            this.room.transmitMessage(FRGameSessionType.DRAW, { ...this.round(), players: this.players(), betTime: setup.betTime });
        }
    }

    /** The croupier places the ball, sealed until the punter bet, and bets in public */
    public async place(pocket: number, bets: Bets): Promise<void> {
        const game: FixedRouletteGameState | null = this.game();
        if (game === null || !this.canPlace() || !isPocket(this.rules, pocket) || !isCroupierBet(this.rules, this.myChips() as number, bets)) {
            return;
        }

        // The game of the ball, fixed before the hash: a timeout applied meanwhile ends the match
        const round: number = game.round();
        const placed: Omit<FixedRouletteCommitMessage, 'commitment'> = { ...this.round(), round, bets };
        const salt: string = drawSalt();
        await this.seal(round, { pocket, salt }, this.preimage(round, pocket, salt, this.myIndex() as number),
            (commitment: string) => this.room.transmitMessage(FRGameSessionType.COMMIT, { ...placed, commitment }));
    }

    /** The punter bets, once the croupier bet */
    public bet(bets: Bets): void {
        const game: FixedRouletteGameState | null = this.game();

        if (game !== null && this.canBet() && isPunterBet(this.rules, this.myChips() as number, totalOf(game.bets()[Side.CROUPIER] as Bets), bets)) {
            this._sending.set(true);
            this.room.transmitMessage(FRGameSessionType.BET, { ...this.round(), round: game.round(), bets });
        }
    }

    protected override async apply(message: FixedRouletteMessage): Promise<void> {
        switch (message.type) {
            case FRGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case FRGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
            case FRGameSessionType.DRAW:
                await this.onDraw(message);
                break;
            case FRGameSessionType.COMMIT:
                this.onCommit(message);
                break;
            case FRGameSessionType.BET:
                this.onBet(message);
                break;
            case FRGameSessionType.REVEAL:
                await this.onReveal(message);
                break;
            case FRGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case FRGameSessionType.REMATCH:
                this.onRematch(message.from, message.payload.game);
                break;
        }
    }

    /** Both seats taken */
    protected override enough(): boolean {
        return this.tableSeats.taken().length === this.rules.seats;
    }

    protected override setupOf({ betTime }: Readonly<FixedRouletteDrawMessage>): Readonly<FixedRouletteSetup> | undefined {
        const setup: { betTime: unknown } = { betTime };
        return isSetup(this.rules, setup) ? setup : undefined;
    }

    protected override openPlayed(seated: ReadonlyArray<Readonly<SeatedPlayer>>, setup: Readonly<FixedRouletteSetup>): void {
        this.played().open(seated, setup);
    }

    /** The match: its seed draws the croupier of its first game */
    protected override async drawGame(seed: string): Promise<FixedRouletteGameState> {
        return new FixedRouletteGameState(this.rules, this.setup() as FixedRouletteSetup, await drawCroupier(seed, this.rules));
    }

    /** The game of the ball, while it is revealed */
    protected override revealKey(game: FixedRouletteGameState): number | null {
        return game.phase() === FixedRoulettePhase.REVEALING ? game.round() : null;
    }

    protected override transmitReveal(game: FixedRouletteGameState, seal: Readonly<Seal>): void {
        this.room.transmitMessage(FRGameSessionType.REVEAL, { ...this.round(), round: game.round(), pocket: seal.pocket, salt: seal.salt });
    }

    /** The commitment to a ball: the match, the croupier, the game and the pocket, with a salt */
    private preimage(round: number, pocket: number | string, salt: string, croupier: number): ReadonlyArray<CommitmentPart> {
        return [this.played().id(), 'ball', croupier, round, pocket, salt];
    }

    /** Whether a message names the game in progress of the match in progress */
    private isCurrent(game: FixedRouletteGameState, payload: GameRound & RoundKey): boolean {
        return this.isRound(payload) && payload.round === game.round();
    }

    /** The croupier commits to its ball and bets: the first commitment counts, the punter bets next */
    private onCommit(message: AppMessage<FRGameSessionType.COMMIT, FixedRouletteCommitMessage>): void {
        this.committed(this.applyCommit(message), message.payload.round, message.from, message.payload.commitment);
    }

    /**
     * Applies the commitment and the bets to the match, which ignores them out of the placing, and refuses them from the
     * punter or beyond the rules: the croupier is still awaited
     */
    private applyCommit(message: AppMessage<FRGameSessionType.COMMIT, FixedRouletteCommitMessage>): Applied {
        const game: FixedRouletteGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { commitment, bets } = message.payload;

        if (game?.phase() !== FixedRoulettePhase.PLACING || player === null || !this.isCurrent(game, message.payload)) {
            return Applied.IGNORED;
        }
        if (!isCommitment(commitment) || !isBets(this.rules, bets)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return Applied.ILLEGAL;
        }

        const applied: Applied = game.place(player, bets);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        return applied;
    }

    /** The punter bets: bets of the croupier, or beyond the rules, are reported, the punter still awaited */
    private onBet(message: AppMessage<FRGameSessionType.BET, FixedRouletteBetMessage>): void {
        const game: FixedRouletteGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game?.phase() !== FixedRoulettePhase.BETTING || player === null || !this.isCurrent(game, message.payload)) {
            return;
        }
        if (!isBets(this.rules, message.payload.bets)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (game.bet(player, message.payload.bets) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /**
     * The croupier reveals its ball: one not matching its commitment is reported, and forfeits the match; one out of the
     * wheel, matching, is reported, and forfeits it too
     */
    private async onReveal(message: AppMessage<FRGameSessionType.REVEAL, FixedRouletteRevealMessage>): Promise<void> {
        const game: FixedRouletteGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { round, pocket, salt } = message.payload;

        if (game?.phase() !== FixedRoulettePhase.REVEALING || player === null || !this.isCurrent(game, message.payload) || !game.awaited().includes(player)) {
            return;
        }

        const matching: boolean = await this.opened(message, game, player, round, salt,
            (revealed: string) => this.preimage(round, typeof pocket === 'number' ? pocket : '', revealed, player));
        if (matching && game.reveal(player, pocket) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }
}
