import Vec2 from 'vec2';
import { Line } from 'src/app/helpers/chess-helper';
import MoveCondition from './move-condition';

export default class LineMoveCondition extends MoveCondition {

    public constructor(public readonly line: Line) {
        super();
    }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.line;
    }
}
