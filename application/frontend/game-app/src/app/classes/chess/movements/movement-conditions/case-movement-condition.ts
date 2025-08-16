import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2, Vec2Array } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard } from '@app/helpers/chess-board-helper';

export default class CaseMovementCondition extends MovementCondition {

    public readonly relativePosition: Vec2;

    public constructor(relativePosition: Vec2Array, public readonly validPieces: Array<FenPiece>) {
        super();
        this.relativePosition = Vec2.fromArray(relativePosition);
    }

    public override canMove(oldPosition: Vec2, _newPosition: Vec2, board: FenBoard): boolean {
        const piece = ChessBoardHelper.getFenPieceByVec(board, oldPosition.addVec(this.relativePosition));
        return this.validPieces.some((validPiece: FenPiece) => piece === validPiece);
    }
}
