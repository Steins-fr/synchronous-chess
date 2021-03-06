import { DoNotApprocheMovementCondition } from './do-not-approche-movement-condition';
import { FenPiece } from '../../rules/chess-rules';
import Vec2 from 'vec2';
import { FenBoard } from '../../../../helpers/chess-board-helper';

describe('DoNotApprocheMoveCondition', () => {
    it('should create an instance', () => {
        expect(new DoNotApprocheMovementCondition(FenPiece.BLACK_KING, 2)).toBeTruthy();
    });

    it('should say if it can move', () => {
        // Given
        const condition: DoNotApprocheMovementCondition = new DoNotApprocheMovementCondition(FenPiece.BLACK_KING, 2);
        const board: FenBoard = [
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidDistance: boolean = condition.canMove(new Vec2([0, 0]), new Vec2([0, 5]), board);
        const resultInvalidDistance: boolean = condition.canMove(new Vec2([0, 0]), new Vec2([1, 1]), board);

        // Then
        expect(resultValidDistance).toBeTruthy();
        expect(resultInvalidDistance).toBeFalsy();
    });
});
