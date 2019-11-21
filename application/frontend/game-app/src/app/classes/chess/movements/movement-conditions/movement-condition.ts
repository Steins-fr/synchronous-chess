import Vec2 from 'vec2';
import { FenBoard } from 'src/app/helpers/chess-board-helper';

export default abstract class MovementCondition {
    public abstract canMove(oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean;
}
