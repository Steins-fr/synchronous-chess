import { Row } from '@app/classes/chess/interfaces/CoordinateMove';
import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { Vec2 } from '@app/classes/vector/vec2';

export default class LineMovementCondition extends MovementCondition {

    public constructor(public readonly row: Row) {
        super();
    }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.row;
    }
}
