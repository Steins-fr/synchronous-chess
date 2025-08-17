import MovementCondition from '@app/modules/chess/classes/movements/movement-conditions/movement-condition';
import ChessRules from '@app/modules/chess/classes/rules/chess-rules';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { SafeBoard } from '@app/modules/chess/types/safe-board';

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
