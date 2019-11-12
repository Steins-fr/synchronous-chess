import MoveCondition from './move-condition';
import Vec2 from 'vec2';
import ChessHelper, { FenBoard, SafeBoard } from 'src/app/helpers/chess-helper';
import ChessRules from '../../rules/chess-rules';

export class KingSafeMoveCondition extends MoveCondition {

    public readonly andRelativeSafeCell?: Vec2;

    public constructor(public readonly rules: ChessRules, andRelativeSafeCell?: Array<number>) {
        super();
        if (andRelativeSafeCell !== undefined) {
            this.andRelativeSafeCell = new Vec2(andRelativeSafeCell);
        }
    }

    public canMove(oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        const safeBoard: SafeBoard = ChessHelper.fenBoardToSafeBoard(board, this.rules);
        if (this.andRelativeSafeCell !== undefined) {
            const andSafeCell: Vec2 = oldPosition.add(this.andRelativeSafeCell, true);
            if (ChessHelper.isOutOfBoard(andSafeCell) === false && safeBoard[andSafeCell.y][andSafeCell.x] === false) {
                return false;
            }
        }

        return safeBoard[newPosition.y][newPosition.x];
    }
}
