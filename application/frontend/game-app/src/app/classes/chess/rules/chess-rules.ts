import Move from '../moves/move';
import Vec2 from 'vec2';

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
    public abstract readonly kingMove: Array<Move>;
    public abstract readonly queenMove: Array<Move>;
    public abstract readonly bishopMove: Array<Move>;
    public abstract readonly knightMove: Array<Move>;
    public abstract readonly rookMove: Array<Move>;
    public abstract readonly pawnMove: Array<Move>;

    public constructor(public readonly color: PieceColor,
        public isQueenSideCastleAvailable: boolean = true,
        public isKingSideCastelAvailable: boolean = true) { }

    public getPieceMoves(pieceType: PieceType): Array<Move> {
        switch (pieceType) {
            case PieceType.KING:
                return this.kingMove;
            case PieceType.QUEEN:
                return this.queenMove;
            case PieceType.BISHOP:
                return this.bishopMove;
            case PieceType.KNIGHT:
                return this.knightMove;
            case PieceType.ROOK:
                return this.rookMove;
            case PieceType.PAWN:
                return this.pawnMove;
        }
    }

    public getPossiblePlays(pieceType: PieceType, piecePosition: Vec2, board: Array<Array<FenPiece>>): Array<Vec2> {
        return this.getPieceMoves(pieceType).reduce((moves: Array<Vec2>, move: Move) => {
            return [...moves, ...move.possiblePlays(piecePosition, board)];
        }, []);
    }
}
