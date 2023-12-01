import Movement from '@app/classes/chess/movements/movement';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard, SafeBoard } from '@app/helpers/chess-board-helper';

export enum PieceColor {
    WHITE = 'w',
    BLACK = 'b',
    NONE = 'none'
}

export enum PieceType {
    KING = 'k',
    QUEEN = 'q',
    BISHOP = 'b',
    KNIGHT = 'n',
    ROOK = 'r',
    PAWN = 'p',
    NONE = 'none'
}

export enum FenPiece {
    BLACK_KING = 'k',
    BLACK_QUEEN = 'q',
    BLACK_BISHOP = 'b',
    BLACK_KNIGHT = 'n',
    BLACK_ROOK = 'r',
    BLACK_PAWN = 'p',
    WHITE_KING = 'K',
    WHITE_QUEEN = 'Q',
    WHITE_BISHOP = 'B',
    WHITE_KNIGHT = 'N',
    WHITE_ROOK = 'R',
    WHITE_PAWN = 'P',
    EMPTY = ''
}

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
