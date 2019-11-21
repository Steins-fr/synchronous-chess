import Vec2 from 'vec2';
import MovementCondition from './movement-condition';
import { Row } from '../../interfaces/CoordinateMove';

export default class LineMovementCondition extends MovementCondition {

    public constructor(public readonly row: Row) {
        super();
    }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.row;
    }
}
