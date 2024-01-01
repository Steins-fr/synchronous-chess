import Movement, { MovementType } from '@app/classes/chess/movements/movement';
import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { PieceColor, FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2, Vec2Array } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard } from '@app/helpers/chess-board-helper';

export default class HopMovement extends Movement {
    private constructor(vector: Vec2, conditions: Array<MovementCondition>) {
        super(MovementType.HOP, vector, conditions);
        super.validVector();
    }

    public static buildAll(vectors: Array<Vec2Array>, conditions: Array<MovementCondition> = []): Array<HopMovement> {
        return vectors.map((vector: Vec2Array) => HopMovement.build(vector, conditions));
    }

    public static build(vector: Vec2Array, conditions: Array<MovementCondition> = []): HopMovement {
        return new HopMovement(Vec2.fromArray(vector), conditions);
    }

    protected override _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        const myColor: PieceColor = ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, position));
        const plays: Array<Vec2> = [];
        const newPosition: Vec2 = position.addVec(this.vector);

        // If we stop on the board, we can move if the destination is empty or occupied by an opponent piece
        if (!ChessBoardHelper.isOutOfBoardByVec(newPosition)) {
            const destinationFenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(board, newPosition);


            if (destinationFenPiece === FenPiece.EMPTY || ChessBoardHelper.pieceColor(destinationFenPiece) !== myColor) {
                plays.push(newPosition);
            }
        }

        return plays;
    }
}
