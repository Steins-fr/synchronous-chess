import Movement from '../movements/movement';
import Vec2 from 'vec2';
import { FenBoard, SafeBoard } from 'src/app/helpers/chess-board-helper';

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
    public abstract readonly kingMovement: Array<Movement>;
    public abstract readonly queenMovement: Array<Movement>;
    public abstract readonly bishopMovement: Array<Movement>;
    public abstract readonly knightMovement: Array<Movement>;
    public abstract readonly rookMovement: Array<Movement>;
    public abstract readonly pawnMovement: Array<Movement>;

    public constructor(public readonly color: PieceColor,
        public isQueenSideCastleAvailable: boolean = true,
        public isKingSideCastleAvailable: boolean = true) { }

    public getPieceMovements(pieceType: PieceType): Array<Movement> {
        switch (pieceType) {
            case PieceType.KING:
                return this.kingMovement;
            case PieceType.QUEEN:
                return this.queenMovement;
            case PieceType.BISHOP:
                return this.bishopMovement;
            case PieceType.KNIGHT:
                return this.knightMovement;
            case PieceType.ROOK:
                return this.rookMovement;
            case PieceType.PAWN:
                return this.pawnMovement;
        }
    }

    public getPossiblePlays(pieceType: PieceType, piecePosition: Vec2, board: Array<Array<FenPiece>>): Array<Vec2> {
        return this.getPieceMovements(pieceType).reduce((movements: Array<Vec2>, movement: Movement) => {
            return [...movements, ...movement.possiblePlays(piecePosition, board)];
        }, []);
    }

    public abstract getSafeBoard(board: FenBoard): SafeBoard;
}
