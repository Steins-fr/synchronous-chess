import { MoveType } from './move';
import Vec2 from 'vec2';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece, PieceColor } from '../piece/piece';
import VectorMove from './vector-move';

export default class HopMove extends VectorMove {
    private constructor(vector: Vec2) {
        super(MoveType.HOP, vector);
        super.validVector();
    }

    public static build(...vectors: Array<Array<number>>): Array<HopMove> {
        return vectors.map((vector: Array<number>) => new HopMove(new Vec2(vector)));
    }

    public possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        const myColor: PieceColor = ChessHelper.pieceColor(ChessHelper.getFenPiece(board, position));
        const plays: Array<Vec2> = [];
        const newPosition: Vec2 = position.add(this.vector, true);
        const destinationFenPiece: FenPiece = ChessHelper.getFenPiece(board, newPosition);

        // If we stop on the board, we can move if the destination is empty or occupied by an opponent piece
        if (ChessHelper.isOutOfBoard(newPosition) === false
            && (
                destinationFenPiece === FenPiece.EMPTY
                || ChessHelper.pieceColor(destinationFenPiece) !== myColor)
        ) {
            plays.push(newPosition);
        }

        return plays;
    }
}
