import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { FenBoard } from '@app/modules/chess/types/fen-board';

export default abstract class MovementCondition {
    public abstract canMove(oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean;
}
