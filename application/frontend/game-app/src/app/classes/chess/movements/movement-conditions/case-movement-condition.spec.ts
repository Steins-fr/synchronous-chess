import CaseMovementCondition from './case-movement-condition';
import Vec2 from 'vec2';
import { FenPiece } from '../../rules/chess-rules';
import { FenBoard } from 'src/app/helpers/chess-board-helper';


describe('CaseMoveCondition', () => {
    it('should create an instance', () => {
        expect(new CaseMovementCondition([1, 1], [])).toBeTruthy();
    });

    it('should say if it can move', () => {
        // Given
        const conditionNoValidPieces: CaseMovementCondition = new CaseMovementCondition([1, 0], []);
        const conditionHasWhiteKing: CaseMovementCondition = new CaseMovementCondition([1, 0], [FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.BLACK_BISHOP]);
        const conditionNoWhiteKing: CaseMovementCondition = new CaseMovementCondition([1, 0], [FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP]);

        const board: FenBoard = [
            [FenPiece.BLACK_BISHOP, FenPiece.WHITE_KING, FenPiece.EMPTY]
        ];

        // When
        const resultNoValidPieces: boolean = conditionNoValidPieces.canMove(new Vec2([0, 0]), undefined, board);
        const resultHasWhiteKing: boolean = conditionHasWhiteKing.canMove(new Vec2([0, 0]), undefined, board);
        const resultNoWhiteKing: boolean = conditionNoWhiteKing.canMove(new Vec2([0, 0]), undefined, board);

        // Then
        expect(resultNoValidPieces).toBeFalsy();
        expect(resultHasWhiteKing).toBeTruthy();
        expect(resultNoWhiteKing).toBeFalsy();
    });
});
