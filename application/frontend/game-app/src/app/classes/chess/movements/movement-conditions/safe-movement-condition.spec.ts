import { SafeMovementCondition } from '@app/classes/chess/movements/movement-conditions/safe-movement-condition';
import { FenPiece, PieceColor } from '@app/classes/chess/rules/chess-rules';
import SynchronousChessRules from '@app/classes/chess/rules/synchronous-chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/helpers/chess-board-helper';

describe('SafeMoveCondition', () => {
    it('should say if it can move', () => {
        // Given
        const condition: SafeMovementCondition = new SafeMovementCondition(new SynchronousChessRules(PieceColor.BLACK), false);
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
        const resultValidKingSafety: boolean = condition.canMove(new Vec2(4, 0), new Vec2(3, 0), board);
        const resultInvalidKingSafety: boolean = condition.canMove(new Vec2(4, 0), new Vec2(5, 0), board);

        // Then
        expect(resultValidKingSafety).toBeTruthy();
        expect(resultInvalidKingSafety).toBeFalsy();
    });

    it('should say if it can move without safety', () => {
        // Given
        const condition: SafeMovementCondition = new SafeMovementCondition(new SynchronousChessRules(PieceColor.BLACK), true);
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
        const resultValidKingSafety1: boolean = condition.canMove(new Vec2(4, 0), new Vec2(3, 0), board);
        const resultValidKingSafety2: boolean = condition.canMove(new Vec2(4, 0), new Vec2(5, 0), board);

        // Then
        expect(resultValidKingSafety1).toBeTruthy();
        expect(resultValidKingSafety2).toBeTruthy();
    });

    it('should say if it can move (with cell condition safety)', () => {
        // Given
        const condition: SafeMovementCondition = new SafeMovementCondition(new SynchronousChessRules(PieceColor.BLACK), false, [1, 0]);
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
        const resultValidKingSafety: boolean = condition.canMove(new Vec2(7, 1), new Vec2(7, 2), board);
        const resultInvalidKingSafety: boolean = condition.canMove(new Vec2(4, 0), new Vec2(6, 0), board);

        // Then
        expect(resultValidKingSafety).toBeTruthy();
        expect(resultInvalidKingSafety).toBeFalsy();
    });
});
