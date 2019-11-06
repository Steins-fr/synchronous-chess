import Move from '../moves/move';

export enum PieceColor {
    WHITE = 'w',
    BLACK = 'b'
}

export enum PieceType {
    KING = 'k',
    QUEEN = 'q',
    BISHOP = 'b',
    KNIGHT = 'n',
    ROOK = 'r',
    PAWN = 'p'
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

export default abstract class Piece {

    protected static readonly fullTypes: Map<PieceColor, Map<PieceType, FenPiece>> = new Map<PieceColor, Map<PieceType, FenPiece>>([
        [PieceColor.BLACK, new Map<PieceType, FenPiece>([
            [PieceType.BISHOP, FenPiece.BLACK_BISHOP],
            [PieceType.KING, FenPiece.BLACK_KING],
            [PieceType.KNIGHT, FenPiece.BLACK_KNIGHT],
            [PieceType.PAWN, FenPiece.BLACK_PAWN],
            [PieceType.QUEEN, FenPiece.BLACK_QUEEN],
            [PieceType.ROOK, FenPiece.BLACK_ROOK],
        ])],
        [PieceColor.WHITE, new Map<PieceType, FenPiece>([
            [PieceType.BISHOP, FenPiece.WHITE_BISHOP],
            [PieceType.KING, FenPiece.WHITE_KING],
            [PieceType.KNIGHT, FenPiece.WHITE_KNIGHT],
            [PieceType.PAWN, FenPiece.WHITE_PAWN],
            [PieceType.QUEEN, FenPiece.WHITE_QUEEN],
            [PieceType.ROOK, FenPiece.WHITE_ROOK],
        ])]
    ]);

    public abstract readonly moves: Array<Move>;

    public constructor(public readonly color: PieceColor, public readonly type: PieceType) {

    }

    public get fullType(): FenPiece {
        return Piece.fullTypes.get(this.color).get(this.type);
    }
}
