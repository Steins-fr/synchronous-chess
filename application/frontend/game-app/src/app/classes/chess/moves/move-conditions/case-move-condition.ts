import Vec2 from 'vec2';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece } from '../../piece/piece';

export default class CaseMoveCondition {

    public readonly relativePosition: Vec2;

    public constructor(relativePosition: Array<number>, public readonly validPieces: Array<FenPiece>) {
        this.relativePosition = new Vec2(relativePosition);
    }

    public canMove(oldPosition: Vec2, _newPosition: Vec2, board: FenBoard): boolean {
        const piece: FenPiece = ChessHelper.getFenPiece(board, oldPosition.add(this.relativePosition, true));
        return this.validPieces.some((validPiece: FenPiece) => piece === validPiece);
    }
}
