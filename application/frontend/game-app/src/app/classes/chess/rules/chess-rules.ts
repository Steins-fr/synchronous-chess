import Move from '../moves/move';
import { PieceType, FenPiece, PieceColor } from '../piece/piece';
import Vec2 from 'vec2';

export default abstract class ChessRules {
    public abstract readonly kingMove: Array<Move>;
    public abstract readonly queenMove: Array<Move>;
    public abstract readonly bishopMove: Array<Move>;
    public abstract readonly knightMove: Array<Move>;
    public abstract readonly rookMove: Array<Move>;
    public abstract readonly pawnMove: Array<Move>;
    public castlingA: boolean = true;
    public castlingH: boolean = true;

    public constructor(public readonly color: PieceColor) { }

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
