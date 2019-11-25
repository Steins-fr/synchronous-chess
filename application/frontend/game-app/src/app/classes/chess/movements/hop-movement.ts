import Movement, { MovementType } from './movement';
import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from '../../../helpers/chess-board-helper';
import { FenPiece, PieceColor } from '../rules/chess-rules';
import MoveCondition from './movement-conditions/movement-condition';

export default class HopMovement extends Movement {
    private constructor(vector: Vec2, conditions: Array<MoveCondition>) {
        super(MovementType.HOP, vector, conditions);
        super.validVector();
    }

    public static buildAll(vectors: Array<Array<number>>, conditions: Array<MoveCondition> = []): Array<HopMovement> {
        return vectors.map((vector: Array<number>) => HopMovement.build(vector, conditions));
    }

    public static build(vector: Array<number>, conditions: Array<MoveCondition> = []): HopMovement {
        return new HopMovement(new Vec2(vector), conditions);
    }

    protected _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        const myColor: PieceColor = ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, position));
        const plays: Array<Vec2> = [];
        const newPosition: Vec2 = position.add(this.vector, true);
        const destinationFenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(board, newPosition);

        // If we stop on the board, we can move if the destination is empty or occupied by an opponent piece
        if (ChessBoardHelper.isOutOfBoardByVec(newPosition) === false
            && (
                destinationFenPiece === FenPiece.EMPTY
                || ChessBoardHelper.pieceColor(destinationFenPiece) !== myColor)
        ) {
            plays.push(newPosition);
        }

        return plays;
    }
}
