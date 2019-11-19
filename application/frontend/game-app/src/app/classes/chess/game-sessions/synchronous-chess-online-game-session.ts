import { RoomService } from 'src/app/services/room/room.service';
import { NgZone } from '@angular/core';
import { PieceColor } from '../rules/chess-rules';
import SynchronousChessGameSession from './synchronous-chess-game-session';
import { RoomManager } from '../../room-manager/room-manager';
import { RoomServiceMessage } from '../../webrtc/messages/room-service-message';
import { Position } from '../games/synchronous-chess-game';

export enum SCGameSessionType {
    CONFIGURATION = 'SC_GS_configuration',
    PLAY = 'SC_GS_play'
}

interface PlayMessage {
    from: Position;
    to: Position;
}

export default abstract class SynchronousChessOnlineGameSession extends SynchronousChessGameSession {

    public constructor(protected readonly roomService: RoomService, protected readonly roomManager: RoomManager, ngZone: NgZone) {
        super(ngZone);
        this.roomService.notifier.follow(SCGameSessionType.PLAY, this, (message: RoomServiceMessage<SCGameSessionType, PlayMessage>) => this.onPlay(message.payload));
    }

    public get playerColor(): PieceColor {
        if (this.roomService.isReady() === false
            || this.configuration.whitePlayer === undefined
            || this.configuration.blackPlayer === undefined) {
            return PieceColor.NONE;
        }

        switch (this.roomService.localPlayer.name) {
            case this.configuration.whitePlayer:
                return PieceColor.WHITE;
            case this.configuration.blackPlayer:
                return PieceColor.BLACK;
            default:
                return PieceColor.NONE;
        }
    }

    public onPlay(playMessage: PlayMessage): void {
        this.ngZone.run(() => this.play(playMessage.from, playMessage.to));
    }

    public play(from: Position, to: Position): boolean {
        if (super.play(from, to)) {
            const playMessage: PlayMessage = { from, to };
            this.roomService.transmitMessage(SCGameSessionType.PLAY, playMessage);
            return true;
        }

        return false;
    }
}
