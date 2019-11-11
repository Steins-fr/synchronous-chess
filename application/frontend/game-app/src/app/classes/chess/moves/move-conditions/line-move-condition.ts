import Vec2 from 'vec2';
import { Line } from 'src/app/helpers/chess-helper';

export default class LineMoveCondition {

    public constructor(public readonly line: Line) { }

    public canMove(oldPosition: Vec2): boolean {
        return oldPosition.y === this.line;
    }
}
