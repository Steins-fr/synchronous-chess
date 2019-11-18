import Move, { MoveType } from './move';
import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from 'src/app/helpers/chess-board-helper';
import { FenPiece, PieceColor } from '../rules/chess-rules';
import MoveCondition from './move-conditions/move-condition';

export default class HopMove extends Move {
    private constructor(vector: Vec2, conditions: Array<MoveCondition>) {
        super(MoveType.HOP, vector, conditions);
        super.validVector();
    }

    public static buildAll(vectors: Array<Array<number>>, conditions: Array<MoveCondition> = []): Array<HopMove> {
        return vectors.map((vector: Array<number>) => HopMove.build(vector, conditions));
    }

    public static build(vector: Array<number>, conditions: Array<MoveCondition> = []): HopMove {
        return new HopMove(new Vec2(vector), conditions);
    }

    protected _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        const myColor: PieceColor = ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPiece(board, position));
        const plays: Array<Vec2> = [];
        const newPosition: Vec2 = position.add(this.vector, true);
        const destinationFenPiece: FenPiece = ChessBoardHelper.getFenPiece(board, newPosition);

        // If we stop on the board, we can move if the destination is empty or occupied by an opponent piece
        if (ChessBoardHelper.isOutOfBoard(newPosition) === false
            && (
                destinationFenPiece === FenPiece.EMPTY
                || ChessBoardHelper.pieceColor(destinationFenPiece) !== myColor)
        ) {
            plays.push(newPosition);
        }

        return plays;
    }
}
