import Vec2 from 'vec2';
import { Row } from 'src/app/helpers/chess-board-helper';
import MoveCondition from './move-condition';

export default class LineMoveCondition extends MoveCondition {

    public constructor(public readonly row: Row) {
        super();
    }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.row;
    }
}
