import { Component, OnInit, NgZone } from '@angular/core';
import Vec2 from 'vec2';
import ChessBoardHelper, { ValidPlayBoard } from '../../helpers/chess-board-helper';
import { RoomService, RoomServiceEventType } from '../../services/room/room.service';
import SynchronousChessGameSession from '../../classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessLocalGameSession from '../../classes/chess/game-sessions/synchronous-chess-local-game-session';
import { RoomMessage } from '../../classes/webrtc/messages/room-message';
import SynchronousChessGameSessionBuilder from '../../classes/chess/game-sessions/synchronous-chess-game-session-builder';
import { RoomManager } from '../../classes/room-manager/room-manager';
import CoordinateMove, { Coordinate } from '../../classes/chess/interfaces/CoordinateMove';
import TurnType from '../../classes/chess/turns/turn.types';
import { PieceColor, FenPiece } from '../../classes/chess/rules/chess-rules';
import MoveTurnAction from 'src/app/classes/chess/turns/turn-actions/move-turn-action';
import Move from 'src/app/classes/chess/interfaces/move';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss']
})
export class SyncChessGameComponent implements OnInit {

    public gameSession: SynchronousChessGameSession;
    public playedPiece: Vec2 = new Vec2(-1, -1);
    public validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
    public blackPiece: FenPiece = FenPiece.BLACK_KING;
    public whitePiece: FenPiece = FenPiece.WHITE_KING;

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
        const coordinateMove: CoordinateMove = {
            from: this.playedPiece.toArray(),
            to: cellPos.toArray()
        };

        this.gameSession.move(ChessBoardHelper.fromCoordinateMoveToMove(coordinateMove));
        this.resetHighlight();
        this.playedPiece = new Vec2(-1, -1);
    }

    private resetHighlight(): void {
        this.validPlayBoard = ChessBoardHelper.createFilledBoard(false);
    }

    public turnType(): string {
        switch (this.gameSession.game.getTurnType()) {
            case TurnType.MOVE_SYNCHRONE:
                return 'Synchronisé';
            case TurnType.MOVE_INTERMEDIATE:
                return 'Intermédiaire';
            default:
                return '';
        }
    }

    public whiteHasPlayed(): boolean {
        return this.gameSession.game.hasPlayed(PieceColor.WHITE);
    }

    public blackHasPlayed(): boolean {
        return this.gameSession.game.hasPlayed(PieceColor.BLACK);
    }

    public whiteLastMove(): string {
        const action: MoveTurnAction | null = this.gameSession.game.lastMoveTurnAction();
        return action === null ? '' : this.formatLastMove(action.whiteMove);
    }

    private formatLastMove(move: Move | null): string {
        if (move === null) {
            return 'a passé';
        }
        const from: string = `${move.from[0].toUpperCase()}${move.from[1]}`;
        const to: string = `${move.to[0].toUpperCase()}${move.to[1]}`;

        return `${from} -> ${to}`;
    }

    public blackLastMove(): string {
        const action: MoveTurnAction | null = this.gameSession.game.lastMoveTurnAction();
        return action === null ? '' : this.formatLastMove(action.blackMove);
    }

    public displayBlackSkipButton(): boolean {
        return this.gameSession.playingColor === PieceColor.BLACK;
    }

    public displayWhiteSkipButton(): boolean {
        return this.gameSession.playingColor === PieceColor.WHITE;
    }

    public skip(): void {
        this.gameSession.move(null);
    }
}
