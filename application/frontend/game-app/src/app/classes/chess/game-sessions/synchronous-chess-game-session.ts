import { NgZone } from '@angular/core';
import { PieceColor, PieceType } from '../rules/chess-rules';
import SynchronousChessGame from '../games/synchronous-chess-game';
import ChessBoardHelper, { FenBoard } from '../../../helpers/chess-board-helper';
import Move from '../interfaces/move';
import CoordinateMove from '../interfaces/CoordinateMove';

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

    protected runMove(color: PieceColor, move: Move | null): boolean {
        if (move !== null && ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPiece(this.game.fenBoard, move.from)) !== color) {
            return false;
        }

        if (this.game.registerMove(move, color) === false) {
            return false;
        }

        if (move !== null && color === this.myColor) {
            this.movePreview = ChessBoardHelper.fromMoveToCoordinateMove(move);
        }

        if (this.game.runTurn()) {
            this.movePreview = undefined;
        }

        return true;
    }

    protected runPromotion(color: PieceColor, pieceType: PieceType): boolean {

        if (this.game.promote(pieceType, color) === false) {
            return false;
        }

        this.game.runTurn();
        return true;
    }

    public abstract move(move: Move | null): void;
    public abstract promote(pieceType: PieceType): void;
}
