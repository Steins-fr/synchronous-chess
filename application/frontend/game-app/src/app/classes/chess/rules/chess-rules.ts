import Movement from '@app/classes/chess/movements/movement';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { SafeBoard } from '@app/classes/chess/types/safe-board';
import { PieceColor } from '@app/classes/chess/enums/piece-color.enum';
import { PieceType } from '@app/classes/chess/enums/piece-type.enum';
import { FenPiece } from '@app/classes/chess/enums/fen-piece.enum';

export default abstract class ChessRules {
    protected abstract readonly pieceMovement: Record<PieceType, () => Array<Movement>>;

    protected constructor(
        public readonly color: PieceColor,
        public isQueenSideCastleAvailable: boolean = true,
        public isKingSideCastleAvailable: boolean = true,
    ) { }

    public getPieceMovements(pieceType: PieceType): Array<Movement> {
        return this.pieceMovement[pieceType]();
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

    public abstract getSafeBoard(board: FenBoard): SafeBoard;
}
