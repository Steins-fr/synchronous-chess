import { Component, OnInit, NgZone } from '@angular/core';
import Vec2 from 'vec2';
import ChessBoardHelper, { ValidPlayBoard } from 'src/app/helpers/chess-board-helper';
import { RoomService, RoomServiceEventType } from 'src/app/services/room/room.service';
import SynchronousChessGameSession from 'src/app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessLocalGameSession from 'src/app/classes/chess/game-sessions/synchronous-chess-local-game-session';
import { RoomMessage } from 'src/app/classes/webrtc/messages/room-message';
import SynchronousChessGameSessionBuilder from 'src/app/classes/chess/game-sessions/synchronous-chess-game-session-builder';
import { RoomManager } from 'src/app/classes/room-manager/room-manager';
import { Coordinate } from 'src/app/classes/chess/interfaces/CoordinateMove';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss']
})
export class SyncChessGameComponent implements OnInit {

    public gameSession: SynchronousChessGameSession;
    public playedPiece: Vec2 = new Vec2(-1, -1);
    public validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);

    public constructor(
        public roomService: RoomService,
        private readonly ngZone: NgZone) {
        this.gameSession = new SynchronousChessLocalGameSession(ngZone);
    }

    public ngOnInit(): void {
        this.roomService.notifier.follow(RoomServiceEventType.ROOM_MANAGER, this, (roomTypeMessage: RoomMessage<RoomManager>) => this.onRoomManager(roomTypeMessage.payload));
    }

    private onRoomManager(roomManager: RoomManager): void {
        this.gameSession = SynchronousChessGameSessionBuilder.buildOnline(this.roomService, roomManager, this.ngZone);
        this.roomService.notifier.unfollow(RoomServiceEventType.ROOM_MANAGER, this);
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece = cellPos;
        this.pieceClicked(cellPos);
    }

    public pieceClicked(cellPos: Vec2): void {
        this.resetHighlight();
        this.gameSession.game.getPossiblePlays(cellPos).forEach((play: Vec2) => {
            this.validPlayBoard[play.y][play.x] = true;
        });
    }

    public pieceDropped(cellPos: Vec2): void {
        const from: Coordinate = this.playedPiece.toArray();
        const to: Coordinate = cellPos.toArray();
        this.gameSession.move(from, to);
        this.resetHighlight();
        this.playedPiece = new Vec2(-1, -1);
    }

    private resetHighlight(): void {
        this.validPlayBoard = ChessBoardHelper.createFilledBoard(false);
    }
}
