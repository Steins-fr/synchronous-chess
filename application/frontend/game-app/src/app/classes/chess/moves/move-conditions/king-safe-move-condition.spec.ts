import { KingSafeMoveCondition } from './king-safe-move-condition';
import SynchronousChessRules from '../../rules/synchronous-chess-rules';
import { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece } from '../../piece/piece';
import Vec2 from 'vec2';

describe('KingSafeMoveCondition', () => {
    it('should create an instance', () => {
        expect(new KingSafeMoveCondition(undefined)).toBeTruthy();
    });

    it('should say if it can move', () => {
        // Given
        const condition: KingSafeMoveCondition = new KingSafeMoveCondition(SynchronousChessRules.blackRules);
        const board: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidKingSafety: boolean = condition.canMove(new Vec2([4, 0]), new Vec2([3, 0]), board);
        const resultInvalidKingSafety: boolean = condition.canMove(new Vec2([4, 0]), new Vec2([5, 0]), board);

        // Then
        expect(resultValidKingSafety).toBeTruthy();
        expect(resultInvalidKingSafety).toBeFalsy();
    });

    it('should say if it can move (with cell condition safety)', () => {
        // Given
        const condition: KingSafeMoveCondition = new KingSafeMoveCondition(SynchronousChessRules.blackRules, [1, 0]);
        const board: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidKingSafety: boolean = condition.canMove(new Vec2([7, 1]), new Vec2([7, 2]), board);
        const resultInvalidKingSafety: boolean = condition.canMove(new Vec2([4, 0]), new Vec2([6, 0]), board);

        // Then
        expect(resultValidKingSafety).toBeTruthy();
        expect(resultInvalidKingSafety).toBeFalsy();
    });
});
