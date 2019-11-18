import { Component, OnInit, NgZone } from '@angular/core';
import Vec2 from 'vec2';
import ChessBoardHelper, { ValidPlayBoard, FenBoard } from 'src/app/helpers/chess-board-helper';
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
    public validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
    public fenBoard: FenBoard = this.game.fenBoard;
    public constructor(
        public roomService: RoomService,
        private readonly ngZone: NgZone) {
    }

    public ngOnInit(): void {
        this.roomService.notifier.follow(SCMessageType.PLAY, this, this.onPlay.bind(this));
    }

    private onPlay(message: RoomServiceMessage<SCMessageType, PlayMessage>): void {
        const playMessage: PlayMessage = message.payload;
        this.ngZone.run(() => this.play(playMessage.from, playMessage.to));
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece = cellPos;
        this.pieceClicked(cellPos);
    }

    public pieceClicked(cellPos: Vec2): void {
        this.resetHighlight();
        this.game.getPossiblePlays(cellPos).forEach((play: Vec2) => {
            this.validPlayBoard[play.y][play.x] = true;
        });
    }

    private play(from: Position, to: Position): boolean {
        const playIsValid: boolean = this.game.applyPlay(from, to);
        this.fenBoard = this.game.fenBoard;
        this.resetHighlight();
        this.playedPiece = new Vec2(-1, -1);
        return playIsValid;
    }

    public pieceDropped(cellPos: Vec2): void {
        const from: Position = this.playedPiece.toArray();
        const to: Position = cellPos.toArray();
        if (this.play(from, to)) {
            const playMessage: PlayMessage = { from, to };
            this.roomService.transmitMessage(SCMessageType.PLAY, playMessage);
        }
    }

    private resetHighlight(): void {
        this.validPlayBoard = ChessBoardHelper.createFilledBoard(false);
    }
}
