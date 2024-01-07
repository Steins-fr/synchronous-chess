import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/helpers/chess-board-helper';

export default abstract class MovementCondition {
    public abstract canMove(oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean;
}
