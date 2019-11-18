import { Component, OnInit, NgZone } from '@angular/core';
import Piece, { PieceType, PieceColor } from 'src/app/classes/chess/piece/piece';
import Cell from 'src/app/classes/chess/board/cell';
import Vec2 from 'vec2';
import ChessBoardHelper, { Column, CellBoard } from 'src/app/helpers/chess-board-helper';
import SynchronousChessRules from 'src/app/classes/chess/rules/synchronous-chess-rules';
import { RoomService } from 'src/app/services/room/room.service';
import { RoomServiceMessage } from 'src/app/classes/webrtc/messages/room-service-message';
import SynchronousChessGame, { Position } from 'src/app/classes/chess/games/synchronous-chess-game';

enum SCMessageType {
    PLAY = 'SC-play'
}

interface PlayMessage {
    from: Position;
    to: Position;
}

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss']
})
export class SyncChessGameComponent implements OnInit {

    public game: SynchronousChessGame = new SynchronousChessGame();
    public playedPiece: Vec2 = new Vec2(-1, -1);

    public constructor(
        public roomService: RoomService,
        private readonly ngZone: NgZone) {
    }

    public ngOnInit(): void {
        this.roomService.notifier.follow(SCMessageType.PLAY, this, this.play.bind(this));
    }

    private play(message: RoomServiceMessage<SCMessageType, PlayMessage>): void {
        const playMessage: PlayMessage = message.payload;
        this.ngZone.run(() => this.game.applyPlay(playMessage.from, playMessage.to));
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece = cellPos;
        this.pieceClicked(cellPos);
    }

    public pieceClicked(cellPos: Vec2): void {
        this.game.resetHighlight();
        this.game.highlightValidMoves(cellPos);
    }

    public pieceDropped(cellPos: Vec2): void {
        const from: Position = this.playedPiece.toArray();
        const to: Position = cellPos.toArray();
        if (this.game.applyPlay(from, to)) {
            const playMessage: PlayMessage = { from, to };
            this.roomService.transmitMessage(SCMessageType.PLAY, playMessage);
        }
        this.game.resetHighlight();
        this.playedPiece = new Vec2(-1, -1);
    }
}
