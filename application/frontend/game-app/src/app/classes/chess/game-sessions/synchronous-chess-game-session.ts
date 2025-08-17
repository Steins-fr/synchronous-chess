import { FenBoard } from '@app/classes/chess/types/fen-board';
import SynchronousChessGame from '../games/synchronous-chess-game';
import CoordinateMove from '../interfaces/CoordinateMove';
import Move from '../interfaces/move';
import { PieceColor } from '../enums/piece-color.enum';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { PieceType } from '../enums/piece-type.enum';
import { FenPiece } from '../enums/fen-piece.enum';

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

    public abstract get playingColor(): PieceColor;

    public get spectatorNumber(): number {
        return this.configuration.spectatorNumber;
    }

    public get board(): FenBoard {
        return this.game.fenBoard;
    }

    protected runMove(color: PieceColor, move: Move | null): boolean {
        if (move !== null && ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPiece(this.game.fenBoard, move.from) ?? FenPiece.EMPTY) !== color) {
            return false;
        }

        if (!this.game.registerMove(move, color)) {
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

        if (!this.game.promote(pieceType, color)) {
            return false;
        }

        this.game.runTurn();
        return true;
    }

    public abstract move(move: Move | null): void;
    public abstract promote(pieceType: PieceType): void;
    public abstract destroy(): void;
}
