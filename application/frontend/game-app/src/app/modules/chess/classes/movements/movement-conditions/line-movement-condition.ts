import { Row } from '@app/modules/chess/interfaces/CoordinateMove';
import MovementCondition from '@app/modules/chess/classes/movements/movement-conditions/movement-condition';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';

export default class LineMovementCondition extends MovementCondition {

    public constructor(public readonly row: Row) {
        super();
    }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.row;
    }
}
