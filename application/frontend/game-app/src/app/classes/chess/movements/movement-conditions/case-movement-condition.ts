import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { Vec2, Vec2Array } from '@app/classes/vector/vec2';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { FenPiece } from '../../enums/fen-piece.enum';

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
