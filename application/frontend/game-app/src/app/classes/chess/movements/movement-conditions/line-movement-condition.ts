import Vec2 from 'vec2';
import { Row } from 'src/app/helpers/chess-board-helper';
import MovementCondition from './movement-condition';

export default class LineMovementCondition extends MovementCondition {

    public constructor(public readonly row: Row) {
        super();
    }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.row;
    }
}
