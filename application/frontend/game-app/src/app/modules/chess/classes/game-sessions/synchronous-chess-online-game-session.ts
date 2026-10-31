import { computed, Signal, signal } from '@angular/core';
import SynchronousChessGameSession, { LiveTurns, SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import Move from '@app/modules/chess/interfaces/move';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { Subject, takeUntil } from 'rxjs';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';
import { GameEndReason } from '../games/game-result';
import { SealedTurnStore, StoredTurn } from './sealed-turn-store';

export enum SCGameSessionType {
    /** A participant takes the seat of a color, or leaves its seat with no color */
    SEAT = 'SC_GS_seat',
    /** The commitment of a player to its action of a turn, which stays hidden */
    COMMIT = 'SC_GS_commit',
    /** The action of a player, revealed once every player of the turn is committed */
    REVEAL = 'SC_GS_reveal',
    /** The other seated player or the host frees the seat of a player away, before the game starts */
    UNSEAT = 'SC_GS_unseat',
    /** A player tells the other one stayed away its time while the game waited for it: it loses the game */
    FORFEIT = 'SC_GS_forfeit',
}

export enum SealedActionKind {
    MOVE = 'move',
    PROMOTION = 'promotion',
}

/** What a player does in a turn */
export type SealedAction =
    | { kind: SealedActionKind.MOVE; move: Move | null }
    | { kind: SealedActionKind.PROMOTION; pieceType: PieceType };

export interface SeatMessage {
    color: PieceColor;
}

export interface UnseatMessage {
    color: PieceColor;
    /** The player of the seat, away: a request applied once another one took the seat frees nothing */
    name: string;
}

export interface ForfeitMessage {
    /** The turns the chain ran when the player claimed the game */
    turn: number;
}

export interface CommitMessage {
    turn: number;
    /** The SHA-256 of the turn, the color, the action and a salt */
    commitment: string;
}

export interface RevealMessage {
    turn: number;
    action: SealedAction;
    salt: string;
}

export interface ChessPayloads {
    [SCGameSessionType.SEAT]: SeatMessage;
    [SCGameSessionType.COMMIT]: CommitMessage;
    [SCGameSessionType.REVEAL]: RevealMessage;
    [SCGameSessionType.UNSEAT]: UnseatMessage;
    [SCGameSessionType.FORFEIT]: ForfeitMessage;
}

// The game has its own block chain, so the activity of another chain sharing the room (e.g. the chat) never delays it
export const chessBlockChains: BlockChainRouting<ChessPayloads> = {
    [SCGameSessionType.SEAT]: BlockChainName.CHESS,
    [SCGameSessionType.COMMIT]: BlockChainName.CHESS,
    [SCGameSessionType.REVEAL]: BlockChainName.CHESS,
    [SCGameSessionType.UNSEAT]: BlockChainName.CHESS,
    [SCGameSessionType.FORFEIT]: BlockChainName.CHESS,
};

/** The seconds a player away gets before it loses the game, as the time it gains at poker and at the roulette */
export const CHESS_AWAY_TIME: number = 30;

/** The action of the local player, revealed once every player of its turn is committed */
interface SealedTurn extends StoredTurn {
    revealed: boolean;
}

/**
 * The participants take the seats themselves: the chain orders their requests, so every participant seats the same players,
 * the first request for a free seat getting it. The seats are final once a player committed to its first action: until
 * then, the other seated player or the host frees the seat of a player away.
 *
 * The players play at the same time: each one commits to its action first, and reveals it once every player of the turn
 * is committed. Neither the other player, nor the sequencer ordering the messages, can adapt its action to the other one.
 * A player waiting for the other one, away, claims the game once its time is over.
 */
export default class SynchronousChessOnlineGameSession extends SynchronousChessGameSession {
    protected destroyRef = new Subject<void>();
    private readonly started = signal<boolean>(false);
    public readonly seatsOpen: Signal<boolean> = computed<boolean>(() => !this.started());
    public readonly inMatch: Signal<boolean> = computed<boolean>(() => this.myColor !== PieceColor.NONE && this.started() && !this.game.isGameOver());
    /** The connected participants without a seat */
    public readonly spectatorNumber: Signal<number> = computed<number>(() => {
        const { whitePlayer, blackPlayer } = this.configuration();
        return this.roomService.players().filter(({ name }) => name !== whitePlayer && name !== blackPlayer).length;
    });
    /** The seated players not connected to this page */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const connected: ReadonlySet<string> = new Set<string>(this.roomService.players().map(({ name }) => name));
        const { whitePlayer, blackPlayer } = this.configuration();
        return [whitePlayer, blackPlayer].filter((name: string | undefined): name is string => name !== undefined && !connected.has(name));
    });
    /** A request of the local player, freeing a seat or claiming the game, waits for the chain: it is sent once */
    private readonly sending = signal<boolean>(false);
    /** The local player played, the other one is away: once its time is over, the local player claims the game */
    public readonly forfeitClaimable: Signal<boolean> = computed((): boolean => {
        const color: PieceColor = this.myColor;
        const opponent: string | undefined = this.playerOf(SynchronousChessOnlineGameSession.opponentOf(color));
        return color !== PieceColor.NONE && this.started() && !this.game.isGameOver() && this.game.colorHasPlayed(color)
            && opponent !== undefined && this.awayPlayers().includes(opponent) && !this.sending();
    });
    /** The first commitment of each player for each turn, by `turn color` */
    private readonly commitments = new Map<string, string>();
    /**
     * The actions the local player played in this session, by turn: a turn played alone runs at once, so the next turn
     * may be played before the commitments of the previous one are in the chain. They are kept once revealed, the
     * reveals of the other turns being the ones of a previous session, replayed after a reload of the page.
     */
    private readonly sealedTurns = new Map<number, SealedTurn>();
    /** The reveals the chain delivered, by `turn color`: the turns it ran, whatever the local player ran ahead */
    private readonly revealed = new Set<string>();
    /** The actions committed to before a reload of the page, played once the game reaches their turn */
    private readonly restoredTurns = new Map<number, SealedTurn>();
    private store?: SealedTurnStore;
    /** The reveals are checked one after the other: the reveal of a turn must not be checked before the previous turn is run */
    private reveals: Promise<void> = Promise.resolve();
    private readonly _liveTurns = signal<Readonly<LiveTurns>>({ count: 0, history: 0, board: this.game.fenBoard() });
    public readonly liveTurns: Signal<Readonly<LiveTurns>> = this._liveTurns.asReadonly();
    // The turns run and the end of the game the latest change counted: a change counted by the local player, at its play,
    // is not counted again by a reveal handled meanwhile
    private counted: Readonly<{ turns: number; over: boolean }> = { turns: 0, over: false };
    private readonly _seatsTaken = signal<number>(0);
    public readonly seatsTaken: Signal<number> = this._seatsTaken.asReadonly();

    public constructor(protected readonly roomService: Room<ChessPayloads>) {
        super();
        this.roomService.messenger(SCGameSessionType.SEAT).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onSeat(message));
        this.roomService.messenger(SCGameSessionType.COMMIT).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onCommit(message));
        this.roomService.messenger(SCGameSessionType.REVEAL).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onReveal(message));
        this.roomService.messenger(SCGameSessionType.UNSEAT).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onUnseat(message));
        this.roomService.messenger(SCGameSessionType.FORFEIT).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onForfeit(message));
    }

    private static opponentOf(color: PieceColor): PieceColor {
        return color === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
    }

    public static async commitment(turn: number, color: PieceColor, action: SealedAction, salt: string): Promise<string> {
        return await CryptoHelper.sha256(`${ turn } ${ color } ${ JSON.stringify(action) } ${ salt }`);
    }

    /** The actions committed to and not revealed in the chain yet, kept across the reloads of the page */
    private get sealedTurnStore(): SealedTurnStore {
        this.store ??= new SealedTurnStore(this.roomService.roomName, this.roomService.localPlayer.name);
        return this.store;
    }

    public get myColor(): PieceColor {
        return this.playerColor(this.roomService.localPlayer.name);
    }

    public get playingColor(): PieceColor {
        if (this.configuration().whitePlayer === undefined || this.configuration().blackPlayer === undefined || this.game.isGameOver()) {
            return PieceColor.NONE;
        }

        if (!this.game.colorHasPlayed(this.myColor)) {
            return this.myColor;
        }

        return PieceColor.NONE;
    }

    protected playerColor(playerName: string): PieceColor {
        switch (playerName) {
            case this.configuration().whitePlayer:
                return PieceColor.WHITE;
            case this.configuration().blackPlayer:
                return PieceColor.BLACK;
            default:
                return PieceColor.NONE;
        }
    }

    /** The player seated on a color */
    private playerOf(color: PieceColor): string | undefined {
        const { whitePlayer, blackPlayer } = this.configuration();
        return color === PieceColor.WHITE ? whitePlayer : blackPlayer;
    }

    public override destroy(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
    }

    public takeSeat(color: PieceColor): void {
        this.roomService.transmitMessage(SCGameSessionType.SEAT, { color });
    }

    public leaveSeat(): void {
        this.roomService.transmitMessage(SCGameSessionType.SEAT, { color: PieceColor.NONE });
    }

    /** The requests of every participant, the local one included, in the order of the chain */
    protected onSeat(message: AppMessage<SCGameSessionType.SEAT, SeatMessage>): void {
        if (this.started()) {
            return;
        }

        const { whitePlayer, blackPlayer } = this.configuration();
        // A participant has a single seat: taking a seat leaves the other one
        const seats: SessionConfiguration = {
            whitePlayer: whitePlayer === message.from ? undefined : whitePlayer,
            blackPlayer: blackPlayer === message.from ? undefined : blackPlayer,
        };

        switch (message.payload.color) {
            case PieceColor.WHITE:
                if (seats.whitePlayer !== undefined) {
                    return;
                }
                seats.whitePlayer = message.from;
                break;
            case PieceColor.BLACK:
                if (seats.blackPlayer !== undefined) {
                    return;
                }
                seats.blackPlayer = message.from;
                break;
            case PieceColor.NONE:
                break;
            default:
                // A malformed request
                return;
        }

        this.setConfiguration(seats);
        // A seat taken live as the page ends catching up is heard. A seat asked again by its player (a second click before
        // the first one came back) is no seat taken
        const held: string | undefined = message.payload.color === PieceColor.WHITE ? whitePlayer : blackPlayer;
        if (message.payload.color !== PieceColor.NONE && held !== message.from && !this.roomService.isHistory(message)) {
            this._seatsTaken.update((taken: number) => taken + 1);
        }
    }

    /** The local player frees the seat of a player away, before the game starts: the other seated player, or the host (the sequencer of the room) */
    public canRelease(color: PieceColor): boolean {
        const name: string | undefined = this.playerOf(color);
        return this.seatsOpen() && name !== undefined && this.awayPlayers().includes(name) && !this.sending()
            && (this.myColor === SynchronousChessOnlineGameSession.opponentOf(color) || this.roomService.sequencer() === this.roomService.localPlayer.name);
    }

    public release(color: PieceColor): void {
        this.sending.set(true);
        this.roomService.transmitMessage(SCGameSessionType.UNSEAT, { color, name: this.playerOf(color) as string });
    }

    /**
     * In the order of the chain, with the seats: the other seated player, or the host as the sequencer of the block of
     * its request, alike on a page replaying the chain. No page can tell when the player was away, as for a timeout
     */
    protected onUnseat(message: AppMessage<SCGameSessionType.UNSEAT, UnseatMessage>): void {
        this.sent(message);
        const { color, name } = message.payload;
        const seated: string | undefined = color === PieceColor.WHITE || color === PieceColor.BLACK ? this.playerOf(color) : undefined;

        if (this.started() || seated === undefined || seated !== name
            || (this.playerColor(message.from) !== SynchronousChessOnlineGameSession.opponentOf(color) && this.roomService.sequencedBy(message) !== message.from)) {
            return;
        }

        const { whitePlayer, blackPlayer } = this.configuration();
        this.setConfiguration(color === PieceColor.WHITE ? { whitePlayer: undefined, blackPlayer } : { whitePlayer, blackPlayer: undefined });
    }

    /** A request of the local player is in the chain */
    private sent(message: AppMessage): void {
        if (message.from === this.roomService.localPlayer.name) {
            this.sending.set(false);
        }
    }

    public claimForfeit(): void {
        // Checked again when the clock runs out: the other player may have played or come back meanwhile
        if (!this.forfeitClaimable()) {
            return;
        }

        this.sending.set(true);
        this.roomService.transmitMessage(SCGameSessionType.FORFEIT, { turn: this.chainTurnCount() });
    }

    /**
     * A seated player claims the game of the other one once started, checked in the order of the chain: a page replaying
     * it seats the players and starts the game alike. The rest is checked in the order of the reveals, the ones before it first
     */
    protected onForfeit(message: AppMessage<SCGameSessionType.FORFEIT, ForfeitMessage>): void {
        const color: PieceColor = this.playerColor(message.from);

        if (color === PieceColor.NONE || !this.started() || this.playerOf(SynchronousChessOnlineGameSession.opponentOf(color)) === undefined) {
            this.sent(message);
            return;
        }

        // A claim throwing, its payload being malformed, must not stop the next reveals
        this.inOrder(message, () => logHandlingFailure(message, Promise.resolve().then(() => this.applyForfeit(message, color))));
    }

    /**
     * Handles a message once the reveals before it are: the turns it runs, or the end of the game, are heard when it is
     * live. Counted in the same task as the change, only microtasks apart: no render sees the turn without its count
     */
    private inOrder(message: AppMessage, handling: () => Promise<void>): void {
        const history: boolean = this.roomService.isHistory(message);
        this.reveals = this.reveals.then(async () => {
            await handling();
            this.changed(history);
        });
    }

    /**
     * The turns a change of the game ran, or its end: a live change is counted, for the page to hear it; a change of the
     * history of the room moves the start of the turns heard past it, with the board it left. The page then needs not
     * render the end of the history before the first live change: it hears it from there whatever the render
     */
    private changed(history: boolean): void {
        const turns: number = this.turnCount;
        const over: boolean = this.game.isGameOver();
        if (turns === this.counted.turns && over === this.counted.over) {
            return;
        }

        this.counted = { turns, over };
        this._liveTurns.update((live: Readonly<LiveTurns>): Readonly<LiveTurns> => history
            ? { ...live, history: this.game.playedTurns().length, board: this.game.fenBoard() }
            : { ...live, count: live.count + 1 });
    }

    /**
     * A seated player ends the game of the other one, away while the game waited for it, unless the chain ran the turn
     * before: the first one counts. The claim is void once the late player revealed its action of the turn, when it has
     * no part in it, or when the claimer did not commit to its own. No page can tell when the other one was away, as for
     * a timeout at poker
     */
    private applyForfeit(message: AppMessage<SCGameSessionType.FORFEIT, ForfeitMessage>, color: PieceColor): void {
        this.sent(message);
        const late: PieceColor = SynchronousChessOnlineGameSession.opponentOf(color);
        const turn: number = this.chainTurnCount();

        if (this.game.result()?.reason === GameEndReason.AWAY || (this.game.isGameOver() && turn === this.turnCount) || message.payload.turn !== turn
            || !this.hasPart(turn, late) || this.revealed.has(`${ turn } ${ late }`)
            || (this.hasPart(turn, color) && !this.commitments.has(`${ turn } ${ color }`))) {
            return;
        }

        this.endByForfeit(late);
    }

    /** The turns the chain ran: the turns of the local player whose reveals are not all in the chain yet ran on this page only */
    private chainTurnCount(): number {
        const ahead: number = [...this.sealedTurns.values()].filter(({ turn, colors }: SealedTurn) =>
            turn < this.turnCount && colors.some((color: PieceColor) => !this.revealed.has(`${ turn } ${ color }`))).length;
        return this.turnCount - ahead;
    }

    /**
     * Whether a color plays in a turn of the chain. A turn this page ran ahead is one the local player played, its colors
     * kept; in the turn in progress, a color having played without a reveal in the chain nor a turn of the local player
     * has no part in it
     */
    private hasPart(turn: number, color: PieceColor): boolean {
        const played: boolean = this.sealedTurns.get(turn)?.colors.includes(color) ?? false;
        return turn < this.turnCount ? played : !this.game.colorHasPlayed(color) || this.revealed.has(`${ turn } ${ color }`) || played;
    }

    public move(move: Move | null): void {
        this.play({ kind: SealedActionKind.MOVE, move });
    }

    public promote(pieceType: PieceType): void {
        this.play({ kind: SealedActionKind.PROMOTION, pieceType });
    }

    /** Plays the action locally at once, and commits to it */
    private play(action: SealedAction): void {
        const color: PieceColor = this.playerColor(this.roomService.localPlayer.name);
        const turn: number = this.turnCount;
        const colors: ReadonlyArray<PieceColor> = [PieceColor.WHITE, PieceColor.BLACK].filter((playing: PieceColor) => !this.game.colorHasPlayed(playing));

        if (color !== PieceColor.NONE && this.runAction(color, action)) {
            const salt: string = CryptoHelper.randomHex(16);
            this.sealedTurnStore.save({ turn, colors, action, salt });
            const sealedTurn: SealedTurn = { turn, colors, action, salt, revealed: false };
            this.sealedTurns.set(turn, sealedTurn);
            void this.commit(sealedTurn, color);
            // A turn the local player plays alone runs at once, out of the reveals: heard as a live one
            this.changed(false);
        }
    }

    private async commit(sealedTurn: SealedTurn, color: PieceColor): Promise<void> {
        const commitment: string = await SynchronousChessOnlineGameSession.commitment(sealedTurn.turn, color, sealedTurn.action, sealedTurn.salt);
        this.roomService.transmitMessage(SCGameSessionType.COMMIT, { turn: sealedTurn.turn, commitment });
    }

    private runAction(color: PieceColor, action: SealedAction): boolean {
        return action.kind === SealedActionKind.MOVE ? this.runMove(color, action.move) : this.runPromotion(color, action.pieceType);
    }

    /** The commitments of every player, the local one included */
    protected onCommit(message: AppMessage<SCGameSessionType.COMMIT, CommitMessage>): void {
        const color: PieceColor = this.playerColor(message.from);
        const key: string = `${ message.payload.turn } ${ color }`;

        // A player can not change its action once committed
        if (color === PieceColor.NONE || this.commitments.has(key)) {
            return;
        }

        this.commitments.set(key, message.payload.commitment);
        this.started.set(true);

        // A commitment of the local player it did not play in this page: the page was reloaded since
        if (message.from === this.roomService.localPlayer.name && !this.sealedTurns.has(message.payload.turn)) {
            const { turn, commitment } = message.payload;
            this.inOrder(message, () => logHandlingFailure(message, this.restore(turn, color, commitment)));
        }

        this.revealCommittedTurns();
    }

    /** The action of a commitment of the local player, stored before the reload of the page */
    private async restore(turn: number, color: PieceColor, commitment: string): Promise<void> {
        const stored: Readonly<StoredTurn> | undefined = this.sealedTurnStore.get(turn);

        if (stored && commitment === await SynchronousChessOnlineGameSession.commitment(turn, color, stored.action, stored.salt)) {
            this.restoredTurns.set(turn, { ...stored, revealed: false });
            this.playRestoredTurns();
        }
    }

    /** The restored actions of the current turn, the next turn may be restored too once a turn played alone is run */
    private playRestoredTurns(): void {
        for (let sealedTurn = this.restoredTurns.get(this.turnCount); sealedTurn; sealedTurn = this.restoredTurns.get(this.turnCount)) {
            this.restoredTurns.delete(sealedTurn.turn);
            this.sealedTurns.set(sealedTurn.turn, sealedTurn);
            this.runRevealedAction(this.myColor, sealedTurn.action);
        }

        this.revealCommittedTurns();
    }

    /** In the order of the turns */
    private revealCommittedTurns(): void {
        for (const sealedTurn of this.sealedTurns.values()) {
            if (!sealedTurn.revealed && sealedTurn.colors.every((color: PieceColor) => this.commitments.has(`${ sealedTurn.turn } ${ color }`))) {
                sealedTurn.revealed = true;
                this.roomService.transmitMessage(SCGameSessionType.REVEAL, { turn: sealedTurn.turn, action: sealedTurn.action, salt: sealedTurn.salt });
            }
        }
    }

    /** The reveals of every player, the local one included */
    protected onReveal(message: AppMessage<SCGameSessionType.REVEAL, RevealMessage>): void {
        const color: PieceColor = this.playerColor(message.from);

        if (color === PieceColor.NONE) {
            return;
        }

        // A reveal throwing, its payload being malformed, must not stop the next ones
        this.inOrder(message, () => logHandlingFailure(message, this.applyReveal(message, color)).then(() => this.playRestoredTurns()));
    }

    private async applyReveal(message: AppMessage<SCGameSessionType.REVEAL, RevealMessage>, color: PieceColor): Promise<void> {
        const { turn, action, salt } = message.payload;

        if (message.from === this.roomService.localPlayer.name) {
            // In the chain: a reload does not need it anymore
            this.sealedTurnStore.remove(turn);

            // The local player ran the actions it played at once, not the ones of a previous session replayed after a reload
            if (this.sealedTurns.has(turn)) {
                this.revealed.add(`${ turn } ${ color }`);
                return;
            }
        }

        // The game was claimed from a player away: its action, revealed once back, is not checked
        if (this.game.result()?.reason === GameEndReason.AWAY) {
            return;
        }

        const isCommitted: boolean = this.commitments.get(`${ turn } ${ color }`) === await SynchronousChessOnlineGameSession.commitment(turn, color, action, salt);

        // A player reloading the page may not know its reveal is in the chain already, and reveal it again
        if (isCommitted && (turn < this.turnCount || (turn === this.turnCount && this.game.colorHasPlayed(color)))) {
            return;
        }

        // The action must be the one committed to, for the current turn
        if (turn !== this.turnCount || !isCommitted) {
            this.roomService.reportCheat(message, CheatReason.INVALID_REVEAL);
        } else if (!this.runRevealedAction(color, action)) {
            this.roomService.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        } else {
            this.revealed.add(`${ turn } ${ color }`);
        }
    }

    // A revealed or a restored action does not come from the interface of this page: the game may throw on it
    private runRevealedAction(color: PieceColor, action: SealedAction): boolean {
        try {
            return this.runAction(color, action);
        } catch {
            return false;
        }
    }
}
