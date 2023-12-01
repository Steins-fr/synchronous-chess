import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import ChessRules from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard, SafeBoard } from '@app/helpers/chess-board-helper';

export class SafeMovementCondition extends MovementCondition {

    public readonly andRelativeSafeCell?: Vec2;

    public constructor(
        public readonly rules: ChessRules,
        public readonly preventRecursion: boolean,
        andRelativeSafeCell?: [number, number],
    ) {
        super();
        if (andRelativeSafeCell !== undefined) {
            this.andRelativeSafeCell = Vec2.fromArray(andRelativeSafeCell);
        }
    }

    public canMove(oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        if (this.preventRecursion) {
            return true;
        }

        const safeBoard: SafeBoard = ChessBoardHelper.fenBoardToSafeBoard(board, this.rules);
        if (this.andRelativeSafeCell !== undefined) {
            const andSafeCell: Vec2 = oldPosition.addVec(this.andRelativeSafeCell);
            if (!ChessBoardHelper.isOutOfBoardByVec(andSafeCell) && !safeBoard[andSafeCell.y][andSafeCell.x]) {
                return false;
            }
        }

        return safeBoard[newPosition.y][newPosition.x];
    }
}
