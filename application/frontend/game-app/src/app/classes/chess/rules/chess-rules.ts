import Movement from '@app/classes/chess/movements/movement';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { SafeBoard } from '@app/classes/chess/types/safe-board';
import { PieceColor } from '@app/classes/chess/enums/piece-color.enum';
import { PieceType } from '@app/classes/chess/enums/piece-type.enum';
import { FenPiece } from '@app/classes/chess/enums/fen-piece.enum';

export default abstract class ChessRules {
    protected abstract pieceMovement: Record<PieceType, ReadonlyArray<Movement>>;

    protected constructor(
        public readonly color: PieceColor,
        private _isQueenSideCastleAvailable: boolean = true,
        private _isKingSideCastleAvailable: boolean = true,
    ) { }

    public getPieceMovements(pieceType: PieceType): ReadonlyArray<Movement> {
        return this.pieceMovement[pieceType];
    }

    public getPossiblePlays(pieceType: PieceType, piecePosition: Vec2, board: Array<Array<FenPiece>>): Array<Vec2> {
        return this.getPieceMovements(pieceType).reduce((movements: Array<Vec2>, movement: Movement) => {
            return [...movements, ...movement.possiblePlays(piecePosition, board)];
        }, []);
    }

    public isWhite(): boolean {
        return this.color === PieceColor.WHITE;
    }

    public isBlack(): boolean {
        return this.color === PieceColor.BLACK;
    }


    public setQueenSideCastleAvailable(isAvailable: boolean): void {
        this._isQueenSideCastleAvailable = isAvailable;
        this.updatePieceMovement(this._isQueenSideCastleAvailable, this._isKingSideCastleAvailable);
    }

    public setKingSideCastleAvailable(isAvailable: boolean): void {
        this._isKingSideCastleAvailable = isAvailable;
        this.updatePieceMovement(this._isQueenSideCastleAvailable, this._isKingSideCastleAvailable);
    }

    public isQueenSideCastleAvailable(): boolean {
        return this._isQueenSideCastleAvailable;
    }

    public isKingSideCastleAvailable(): boolean {
        return this._isKingSideCastleAvailable;
    }

    protected abstract updatePieceMovement(isQueenSideCastleAvailable: boolean, isKingSideCastleAvailable: boolean): void;
    public abstract getSafeBoard(board: FenBoard): SafeBoard;
}
