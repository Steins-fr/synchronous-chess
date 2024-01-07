import Movement, { MovementType } from '@app/classes/chess/movements/movement';
import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { PieceColor, FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard } from '@app/helpers/chess-board-helper';

export default class HopMovement extends Movement {
    private constructor(vector: Vec2, conditions: Array<MovementCondition>) {
        super(MovementType.HOP, vector, conditions);
        super.validVector();
    }

    public static buildAll(vectors: Array<[number, number]>, conditions: Array<MovementCondition> = []): Array<HopMovement> {
        return vectors.map((vector: [number, number]) => HopMovement.build(vector, conditions));
    }

    public static build(vector: [number, number], conditions: Array<MovementCondition> = []): HopMovement {
        return new HopMovement(Vec2.fromArray(vector), conditions);
    }

    protected _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        const myColor: PieceColor = ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, position) ?? FenPiece.EMPTY);
        const plays: Array<Vec2> = [];
        const newPosition: Vec2 = position.addVec(this.vector);
        const destinationFenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(board, newPosition) ?? FenPiece.EMPTY;

        // If we stop on the board, we can move if the destination is empty or occupied by an opponent piece
        if (!ChessBoardHelper.isOutOfBoardByVec(newPosition)
            && (
                destinationFenPiece === FenPiece.EMPTY
                || ChessBoardHelper.pieceColor(destinationFenPiece) !== myColor)
        ) {
            plays.push(newPosition);
        }

        return plays;
    }
}
