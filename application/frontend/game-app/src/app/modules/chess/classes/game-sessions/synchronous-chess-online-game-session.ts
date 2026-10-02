import SynchronousChessGameSession, { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
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
import { SealedTurnStore, StoredTurn } from './sealed-turn-store';

export enum SCGameSessionType {
    CONFIGURATION = 'SC_GS_configuration',
    /** The commitment of a player to its action of a turn, which stays hidden */
    COMMIT = 'SC_GS_commit',
    /** The action of a player, revealed once every player of the turn is committed */
    REVEAL = 'SC_GS_reveal',
}

export enum SealedActionKind {
    MOVE = 'move',
    PROMOTION = 'promotion',
}

/** What a player does in a turn */
export type SealedAction =
    | { kind: SealedActionKind.MOVE; move: Move | null }
    | { kind: SealedActionKind.PROMOTION; pieceType: PieceType };

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
    [SCGameSessionType.CONFIGURATION]: SessionConfiguration;
    [SCGameSessionType.COMMIT]: CommitMessage;
    [SCGameSessionType.REVEAL]: RevealMessage;
}

// The game has its own block chain, so the activity of another chain sharing the room (e.g. the chat) never delays it
export const chessBlockChains: BlockChainRouting<ChessPayloads> = {
    [SCGameSessionType.CONFIGURATION]: BlockChainName.CHESS,
    [SCGameSessionType.COMMIT]: BlockChainName.CHESS,
    [SCGameSessionType.REVEAL]: BlockChainName.CHESS,
};

/** The action of the local player, revealed once every player of its turn is committed */
interface SealedTurn extends StoredTurn {
    revealed: boolean;
}

/**
 * The players play at the same time: each one commits to its action first, and reveals it once every player of the turn
 * is committed. Neither the other player, nor the sequencer ordering the messages, can adapt its action to the other one.
 */
export default abstract class SynchronousChessOnlineGameSession extends SynchronousChessGameSession {
    protected destroyRef = new Subject<void>();
    /** The first commitment of each player for each turn, by `turn color` */
    private readonly commitments = new Map<string, string>();
    /**
     * The actions the local player played in this session, by turn: a turn played alone runs at once, so the next turn
     * may be played before the commitments of the previous one are in the chain. They are kept once revealed, the
     * reveals of the other turns being the ones of a previous session, replayed after a reload of the page.
     */
    private readonly sealedTurns = new Map<number, SealedTurn>();
    /** The actions committed to before a reload of the page, played once the game reaches their turn */
    private readonly restoredTurns = new Map<number, SealedTurn>();
    private store?: SealedTurnStore;
    /** The reveals are checked one after the other: the reveal of a turn must not be checked before the previous turn is run */
    private reveals: Promise<void> = Promise.resolve();

    protected constructor(protected readonly roomService: Room<ChessPayloads>) {
        super();
        this.roomService.messenger(SCGameSessionType.COMMIT).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onCommit(message));
        this.roomService.messenger(SCGameSessionType.REVEAL).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onReveal(message));
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
        if (this.configuration().whitePlayer === undefined || this.configuration().blackPlayer === undefined) {
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

    public override destroy(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
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

        // A commitment of the local player it did not play in this page: the page was reloaded since
        if (message.from === this.roomService.localPlayer.name && !this.sealedTurns.has(message.payload.turn)) {
            const { turn, commitment } = message.payload;
            this.reveals = this.reveals.then(() => logHandlingFailure(message, this.restore(turn, color, commitment)));
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
        this.reveals = this.reveals
            .then(() => logHandlingFailure(message, this.applyReveal(message, color)))
            .then(() => this.playRestoredTurns());
    }

    private async applyReveal(message: AppMessage<SCGameSessionType.REVEAL, RevealMessage>, color: PieceColor): Promise<void> {
        const { turn, action, salt } = message.payload;

        if (message.from === this.roomService.localPlayer.name) {
            // In the chain: a reload does not need it anymore
            this.sealedTurnStore.remove(turn);

            // The local player ran the actions it played at once, not the ones of a previous session replayed after a reload
            if (this.sealedTurns.has(turn)) {
                return;
            }
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
