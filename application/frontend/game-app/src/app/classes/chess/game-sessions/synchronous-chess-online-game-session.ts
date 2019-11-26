import { RoomService } from '../../../services/room/room.service';
import { NgZone } from '@angular/core';
import { PieceColor, PieceType } from '../rules/chess-rules';
import SynchronousChessGameSession from './synchronous-chess-game-session';
import { RoomManager } from '../../room-manager/room-manager';
import { RoomServiceMessage } from '../../webrtc/messages/room-service-message';
import { Coordinate } from '../interfaces/CoordinateMove';
import Move from '../interfaces/move';

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

export default abstract class SynchronousChessOnlineGameSession extends SynchronousChessGameSession {

    public constructor(protected readonly roomService: RoomService, protected readonly roomManager: RoomManager, ngZone: NgZone) {
        super(ngZone);
        this.roomService.notifier.follow(SCGameSessionType.PLAY, this, this.onMove.bind(this));
        this.roomService.notifier.follow(SCGameSessionType.PROMOTION, this, this.onPromotion.bind(this));
    }

    public get myColor(): PieceColor {
        return this.playerColor(this.roomService.localPlayer.name);
    }

    public get playingColor(): PieceColor {
        if (this.roomService.isReady() === false
            || this.configuration.whitePlayer === undefined
            || this.configuration.blackPlayer === undefined) {
            return PieceColor.NONE;
        }

        if (this.game.colorHasPlayed(this.myColor) === false) {
            return this.myColor;
        }

        return PieceColor.NONE;
    }

    protected playerColor(playerName: string): PieceColor {
        switch (playerName) {
            case this.configuration.whitePlayer:
                return PieceColor.WHITE;
            case this.configuration.blackPlayer:
                return PieceColor.BLACK;
            default:
                return PieceColor.NONE;
        }
    }

    protected isPlaying(playerName: string): boolean {
        return this.playerColor(playerName) !== PieceColor.NONE;
    }

    protected onMove(message: RoomServiceMessage<SCGameSessionType, PlayMessage>): void {
        // Prevent reception of move from spectator
        if (this.isPlaying(message.from) === false) {
            return;
        }

        const playMessage: PlayMessage = message.payload;
        // Call parent play to prevent re-emit
        this.ngZone.run(() => this.runMove(this.playerColor(message.from), playMessage.move));
    }

    public move(move: Move | null): void {
        const playerName: string = this.roomService.localPlayer.name;

        if (this.isPlaying(playerName) && this.runMove(this.playerColor(playerName), move)) {
            const playMessage: PlayMessage = { move };
            this.roomService.transmitMessage(SCGameSessionType.PLAY, playMessage);
        }
    }

    protected onPromotion(message: RoomServiceMessage<SCGameSessionType, PromotionMessage>): void {
        // Prevent reception of move from spectator
        if (this.isPlaying(message.from) === false) {
            return;
        }

        const promotionMessage: PromotionMessage = message.payload;

        // Call parent play to prevent re-emit
        this.ngZone.run(() => this.runPromotion(this.playerColor(message.from), promotionMessage.pieceType));
    }

    public promote(pieceType: PieceType): void {
        const playerName: string = this.roomService.localPlayer.name;

        if (this.isPlaying(playerName) && this.runPromotion(this.playerColor(playerName), pieceType)) {
            const promotionMessage: PromotionMessage = { pieceType };
            this.roomService.transmitMessage(SCGameSessionType.PROMOTION, promotionMessage);
        }
    }
}
