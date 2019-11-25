import Movement, { MovementType } from './movement';
import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from '../../../helpers/chess-board-helper';
import { PieceColor, FenPiece } from '../rules/chess-rules';
import MoveCondition from './movement-conditions/movement-condition';

export default class LinearMovement extends Movement {
    private constructor(vector: Vec2, conditions: Array<MoveCondition>) {
        super(MovementType.LINEAR, vector, conditions);
        this.validVector();
    }

    public static buildAll(vectors: Array<Array<number>>, conditions: Array<MoveCondition> = []): Array<LinearMovement> {
        return vectors.map((vector: Array<number>) => LinearMovement.build(vector, conditions));
    }

    public static build(vector: Array<number>, conditions: Array<MoveCondition> = []): LinearMovement {
        return new LinearMovement(new Vec2(vector), conditions);
    }

    protected validVector(): void {
        super.validVector();

        const origin: Vec2 = new Vec2(0, 0);
        if (this.vector.distance(origin) >= 2) {
            throw new Error('Linear move does not permit movement of distance more than 1.');
        }
    }

    protected _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        let newPosition: Vec2 = new Vec2(position.toArray());

        const myColor: PieceColor = ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, position));
        const plays: Array<Vec2> = [];

        // Add all plays on empty cells
        newPosition = newPosition.add(this.vector, true);
        while (ChessBoardHelper.isOutOfBoardByVec(newPosition) === false
            && ChessBoardHelper.getFenPieceByVec(board, newPosition) === FenPiece.EMPTY) {

            plays.push(newPosition);
            newPosition = newPosition.add(this.vector, true);
        }

        // If we stop on the board, test if we stopped because of an opponent piece
        if (ChessBoardHelper.isOutOfBoardByVec(newPosition) === false
            && ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, newPosition)) !== myColor) {
            plays.push(newPosition);
        }

        return plays;
    }
}
