import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard, SafeBoard } from 'src/app/helpers/chess-board-helper';
import ChessRules from '../../rules/chess-rules';
import MovementCondition from './movement-condition';

export class SafeMovementCondition extends MovementCondition {

    public readonly andRelativeSafeCell?: Vec2;

    public constructor(public readonly rules: ChessRules, public readonly preventRecursion: boolean, andRelativeSafeCell?: Array<number>) {
        super();
        if (andRelativeSafeCell !== undefined) {
            this.andRelativeSafeCell = new Vec2(andRelativeSafeCell);
        }
    }

    public canMove(oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        if (this.preventRecursion) {
            return true;
        }

        const safeBoard: SafeBoard = ChessBoardHelper.fenBoardToSafeBoard(board, this.rules);
        if (this.andRelativeSafeCell !== undefined) {
            const andSafeCell: Vec2 = oldPosition.add(this.andRelativeSafeCell, true);
            if (ChessBoardHelper.isOutOfBoard(andSafeCell) === false && safeBoard[andSafeCell.y][andSafeCell.x] === false) {
                return false;
            }
        }

        return safeBoard[newPosition.y][newPosition.x];
    }
}
