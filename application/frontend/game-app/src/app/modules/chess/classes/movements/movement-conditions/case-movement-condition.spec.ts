import CaseMovementCondition from '@app/modules/chess/classes/movements/movement-conditions/case-movement-condition';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { describe, test, expect } from 'vitest';

describe('CaseMoveCondition', () => {
    test('should create an instance', () => {
        expect(new CaseMovementCondition([1, 1], [])).toBeTruthy();
    });

    test('should say if it can move', () => {
        // Given
        const conditionNoValidPieces: CaseMovementCondition = new CaseMovementCondition([1, 0], []);
        const conditionHasWhiteKing: CaseMovementCondition = new CaseMovementCondition([1, 0], [FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.BLACK_BISHOP]);
        const conditionNoWhiteKing: CaseMovementCondition = new CaseMovementCondition([1, 0], [FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP]);

        const board: FenBoard = [
            [FenPiece.BLACK_BISHOP, FenPiece.WHITE_KING, FenPiece.EMPTY]
        ];

        // When
        const resultNoValidPieces: boolean = conditionNoValidPieces.canMove(new Vec2(0, 0), new Vec2(0, 0), board);
        const resultHasWhiteKing: boolean = conditionHasWhiteKing.canMove(new Vec2(0, 0), new Vec2(0, 0), board);
        const resultNoWhiteKing: boolean = conditionNoWhiteKing.canMove(new Vec2(0, 0), new Vec2(0, 0), board);

        // Then
        expect(resultNoValidPieces).toBeFalsy();
        expect(resultHasWhiteKing).toBeTruthy();
        expect(resultNoWhiteKing).toBeFalsy();
    });
});
