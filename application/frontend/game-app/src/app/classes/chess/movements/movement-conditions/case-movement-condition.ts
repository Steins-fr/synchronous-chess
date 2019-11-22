import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from 'src/app/helpers/chess-board-helper';
import { FenPiece } from '../../rules/chess-rules';
import MovementCondition from './movement-condition';

export default class CaseMovementCondition extends MovementCondition {

    public readonly relativePosition: Vec2;

    public constructor(relativePosition: Array<number>, public readonly validPieces: Array<FenPiece>) {
        super();
        this.relativePosition = new Vec2(relativePosition);
    }

    public canMove(oldPosition: Vec2, _newPosition: Vec2, board: FenBoard): boolean {
        const piece: FenPiece = ChessBoardHelper.getFenPieceByVec(board, oldPosition.add(this.relativePosition, true));
        return this.validPieces.some((validPiece: FenPiece) => piece === validPiece);
    }
}
