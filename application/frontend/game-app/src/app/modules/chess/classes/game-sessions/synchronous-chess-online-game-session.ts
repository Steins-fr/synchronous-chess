import SynchronousChessGameSession, { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import Move from '@app/modules/chess/interfaces/move';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subject, takeUntil } from 'rxjs';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';

export enum SCGameSessionType {
    CONFIGURATION = 'SC_GS_configuration',
    PLAY = 'SC_GS_play',
    PROMOTION = 'SC_GS_promotion'
}

export interface PlayMessage {
    move: Move | null;
}

export interface PromotionMessage {
    pieceType: PieceType;
}

export interface ChessPayloads {
    [SCGameSessionType.CONFIGURATION]: SessionConfiguration;
    [SCGameSessionType.PLAY]: PlayMessage;
    [SCGameSessionType.PROMOTION]: PromotionMessage;
}

export default abstract class SynchronousChessOnlineGameSession extends SynchronousChessGameSession {
    protected destroyRef = new Subject<void>();

    protected constructor(protected readonly roomService: Room<ChessPayloads>) {
        super();
        this.roomService.messenger(SCGameSessionType.PLAY).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onMove(message));
        this.roomService.messenger(SCGameSessionType.PROMOTION).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onPromotion(message));
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

    protected isPlaying(playerName: string): boolean {
        return this.playerColor(playerName) !== PieceColor.NONE;
    }

    // The room echoes messages to their sender, local moves and promotions are already run by move() and promote()
    private isRemotePlaying(playerName: string): boolean {
        return this.isPlaying(playerName) && playerName !== this.roomService.localPlayer.name;
    }

    protected onMove(message: AppMessage<SCGameSessionType.PLAY, PlayMessage>): void {
        // Prevent reception of move from spectator or from myself
        if (!this.isRemotePlaying(message.from)) {
            return;
        }

        const playMessage: PlayMessage = message.payload;
        // Call parent play to prevent re-emit
        this.runMove(this.playerColor(message.from), playMessage.move);
    }

    public move(move: Move | null): void {
        const playerName: string = this.roomService.localPlayer.name;

        if (this.isPlaying(playerName) && this.runMove(this.playerColor(playerName), move)) {
            const playMessage: PlayMessage = { move };
            this.roomService.transmitMessage(SCGameSessionType.PLAY, playMessage);
        }
    }

    protected onPromotion(message: AppMessage<SCGameSessionType.PROMOTION, PromotionMessage>): void {
        // Prevent reception of promotion from spectator or from myself
        if (!this.isRemotePlaying(message.from)) {
            return;
        }

        const promotionMessage: PromotionMessage = message.payload;

        // Call parent play to prevent re-emit
        this.runPromotion(this.playerColor(message.from), promotionMessage.pieceType);
    }

    public promote(pieceType: PieceType): void {
        const playerName: string = this.roomService.localPlayer.name;

        if (this.isPlaying(playerName) && this.runPromotion(this.playerColor(playerName), pieceType)) {
            const promotionMessage: PromotionMessage = { pieceType };
            this.roomService.transmitMessage(SCGameSessionType.PROMOTION, promotionMessage);
        }
    }
}
