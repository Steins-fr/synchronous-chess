import Movement, { MovementType } from '@app/classes/chess/movements/movement';
import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { PieceColor, FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard } from '@app/helpers/chess-board-helper';

export default class LinearMovement extends Movement {
    private constructor(vector: Vec2, conditions: Array<MovementCondition>) {
        super(MovementType.LINEAR, vector, conditions);
        this.validVector();
    }

    public static buildAll(vectors: Array<[number, number]>, conditions: Array<MovementCondition> = []): Array<LinearMovement> {
        return vectors.map((vector: [number, number]) => LinearMovement.build(vector, conditions));
    }

    public static build(vector: [number, number], conditions: Array<MovementCondition> = []): LinearMovement {
        return new LinearMovement(Vec2.fromArray(vector), conditions);
    }

    protected override validVector(): void {
        super.validVector();

        const origin: Vec2 = new Vec2(0, 0);
        if (this.vector.distance(origin.x, origin.y) >= 2) {
            throw new Error('Linear move does not permit movement of distance more than 1.');
        }
    }

    protected _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        let newPosition: Vec2 = Vec2.fromVec(position);

        const myColor: PieceColor = ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, position));
        const plays: Array<Vec2> = [];

        // Add all plays on empty cells
        newPosition = newPosition.addVec(this.vector);
        while (!ChessBoardHelper.isOutOfBoardByVec(newPosition)
            && ChessBoardHelper.getFenPieceByVec(board, newPosition) === FenPiece.EMPTY) {

            plays.push(newPosition);
            newPosition = newPosition.addVec(this.vector);
        }

        // If we stop on the board, test if we stopped because of an opponent piece
        if (!ChessBoardHelper.isOutOfBoardByVec(newPosition)
            && ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, newPosition)) !== myColor) {
            plays.push(newPosition);
        }

        return plays;
    }
}
