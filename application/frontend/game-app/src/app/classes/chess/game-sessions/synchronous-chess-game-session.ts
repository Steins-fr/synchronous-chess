import { NgZone } from '@angular/core';
import { PieceColor } from '../rules/chess-rules';
import SynchronousChessGame from '../games/synchronous-chess-game';
import ChessBoardHelper, { FenBoard } from '../../../helpers/chess-board-helper';
import Vec2 from 'vec2';
import Move from '../interfaces/move';
import CoordinateMove, { Coordinate } from '../interfaces/CoordinateMove';

export interface SessionConfiguration {
    whitePlayer?: string;
    blackPlayer?: string;
    spectatorNumber: number;
}

export default abstract class SynchronousChessGameSession {

    public readonly game: SynchronousChessGame = new SynchronousChessGame();
    public movePreview?: CoordinateMove;
    public configuration: SessionConfiguration = { spectatorNumber: 0 };

    public abstract myColor: PieceColor;

    public constructor(protected readonly ngZone: NgZone) {
    }

    public abstract get playingColor(): PieceColor;

    public get spectatorNumber(): number {
        return this.configuration.spectatorNumber;
    }

    public get board(): FenBoard {
        return this.game.fenBoard;
    }

    protected runMove(color: PieceColor, from: Coordinate, to: Coordinate): boolean {
        if (ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(this.game.fenBoard, new Vec2(from))) !== color) {
            return false;
        }

        const move: Move = {
            from: ChessBoardHelper.coordinateToFenCoordinate(from),
            to: ChessBoardHelper.coordinateToFenCoordinate(to)
        };

        if (this.game.isMoveValid(move) === false) {
            return false;
        }

        if (color === this.myColor) {
            this.movePreview = ChessBoardHelper.fromMoveToCoordinateMove(move);
        }

        this.game.registerMove(move, color);
        if (this.game.runTurn()) {
            this.movePreview = undefined;
        }

        return true;
    }

    public abstract move(from: Coordinate, to: Coordinate): void;
}
