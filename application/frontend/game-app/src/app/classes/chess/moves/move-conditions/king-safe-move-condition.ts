import MoveCondition from './move-condition';
import Vec2 from 'vec2';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import ChessRules from '../../rules/chess-rules';

export class KingSafeMoveCondition extends MoveCondition {
    public constructor(public readonly rules: ChessRules) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessHelper.fenBoardToSafeBoard(board, this.rules)[newPosition.y][newPosition.x];
    }
}
