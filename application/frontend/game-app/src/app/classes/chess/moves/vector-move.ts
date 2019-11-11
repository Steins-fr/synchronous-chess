import Vec2 from 'vec2';
import Move, { MoveType } from './move';

export default abstract class VectorMove extends Move {
    public constructor(type: MoveType, public readonly vector: Vec2) {
        super(type);
    }

    protected validVector(): void {
        if (this.vector.equal(0, 0)) {
            throw new Error('Movement 0:0 is not permitted!');
        }
    }
}
