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

export enum PieceFullType {
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

    protected static readonly fullTypes: Map<PieceColor, Map<PieceType, PieceFullType>> = new Map<PieceColor, Map<PieceType, PieceFullType>>([
        [PieceColor.BLACK, new Map<PieceType, PieceFullType>([
            [PieceType.BISHOP, PieceFullType.BLACK_BISHOP],
            [PieceType.KING, PieceFullType.BLACK_KING],
            [PieceType.KNIGHT, PieceFullType.BLACK_KNIGHT],
            [PieceType.PAWN, PieceFullType.BLACK_PAWN],
            [PieceType.QUEEN, PieceFullType.BLACK_QUEEN],
            [PieceType.ROOK, PieceFullType.BLACK_ROOK],
        ])],
        [PieceColor.WHITE, new Map<PieceType, PieceFullType>([
            [PieceType.BISHOP, PieceFullType.WHITE_BISHOP],
            [PieceType.KING, PieceFullType.WHITE_KING],
            [PieceType.KNIGHT, PieceFullType.WHITE_KNIGHT],
            [PieceType.PAWN, PieceFullType.WHITE_PAWN],
            [PieceType.QUEEN, PieceFullType.WHITE_QUEEN],
            [PieceType.ROOK, PieceFullType.WHITE_ROOK],
        ])]
    ]);

    public constructor(public readonly color: PieceColor, public readonly type: PieceType) {

    }

    public get fullType(): PieceFullType {
        return Piece.fullTypes.get(this.color).get(this.type);
    }
}
