import SynchronousChessGameSession, { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import Move from '@app/modules/chess/interfaces/move';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Subject, takeUntil } from 'rxjs';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';

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
interface SealedTurn {
    turn: number;
    /** The colors playing the turn */
    colors: ReadonlyArray<PieceColor>;
    action: SealedAction;
    salt: string;
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
    private sealedTurn?: SealedTurn;
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
            this.sealedTurn = { turn, colors, action, salt: CryptoHelper.randomHex(16), revealed: false };
            void this.commit(this.sealedTurn, color);
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
        this.revealIfEveryoneCommitted();
    }

    private revealIfEveryoneCommitted(): void {
        const sealedTurn: SealedTurn | undefined = this.sealedTurn;

        if (!sealedTurn || sealedTurn.revealed || !sealedTurn.colors.every((color: PieceColor) => this.commitments.has(`${ sealedTurn.turn } ${ color }`))) {
            return;
        }

        sealedTurn.revealed = true;
        this.roomService.transmitMessage(SCGameSessionType.REVEAL, { turn: sealedTurn.turn, action: sealedTurn.action, salt: sealedTurn.salt });
    }

    /** The actions of the other players: the local one already played its own */
    protected onReveal(message: AppMessage<SCGameSessionType.REVEAL, RevealMessage>): void {
        const color: PieceColor = this.playerColor(message.from);

        if (color === PieceColor.NONE || message.from === this.roomService.localPlayer.name) {
            return;
        }

        this.reveals = this.reveals.then(() => this.applyReveal(message, color));
    }

    private async applyReveal(message: AppMessage<SCGameSessionType.REVEAL, RevealMessage>, color: PieceColor): Promise<void> {
        const { turn, action, salt } = message.payload;
        const commitment: string | undefined = this.commitments.get(`${ turn } ${ color }`);

        // The action must be the one committed to, for the current turn
        if (turn !== this.turnCount || commitment !== await SynchronousChessOnlineGameSession.commitment(turn, color, action, salt)) {
            this.roomService.reportCheat(message, CheatReason.INVALID_REVEAL);
        } else if (!this.runRevealedAction(color, action)) {
            this.roomService.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    // A revealed action comes from another player: the game may throw on an action its interface never sends
    private runRevealedAction(color: PieceColor, action: SealedAction): boolean {
        try {
            return this.runAction(color, action);
        } catch {
            return false;
        }
    }
}
