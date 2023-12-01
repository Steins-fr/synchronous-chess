import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard } from '@app/helpers/chess-board-helper';

export default class CaseMovementCondition extends MovementCondition {

    public readonly relativePosition: Vec2;

    public constructor(relativePosition: [number, number], public readonly validPieces: Array<FenPiece>) {
        super();
        this.relativePosition = Vec2.fromArray(relativePosition);
    }

    public canMove(oldPosition: Vec2, _newPosition: Vec2, board: FenBoard): boolean {
        const piece: FenPiece = ChessBoardHelper.getFenPieceByVec(board, oldPosition.addVec(this.relativePosition)) ?? FenPiece.EMPTY;
        return this.validPieces.some((validPiece: FenPiece) => piece === validPiece);
    }
}
