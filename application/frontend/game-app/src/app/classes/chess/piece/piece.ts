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

export default abstract class Piece {

    public constructor(public readonly color: PieceColor, public readonly type: PieceType) {

    }
}
