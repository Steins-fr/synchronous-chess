import DestinationColorMovementCondition from './destination-color-movement-condition';
import Vec2 from 'vec2';
import { PieceColor, FenPiece } from '../../rules/chess-rules';
import { FenBoard } from '../../../../helpers/chess-board-helper';


describe('DestinationColorMoveCondition', () => {
    it('should create an instance', () => {
        expect(new DestinationColorMovementCondition(PieceColor.BLACK)).toBeTruthy();
    });

    it('should say if it can move', () => {
        // Given
        const condition1: DestinationColorMovementCondition = new DestinationColorMovementCondition(PieceColor.BLACK);
        const condition2: DestinationColorMovementCondition = new DestinationColorMovementCondition(PieceColor.WHITE);
        const condition3: DestinationColorMovementCondition = new DestinationColorMovementCondition(PieceColor.NONE);

        const board: FenBoard = [
            [FenPiece.BLACK_BISHOP, FenPiece.WHITE_KING, FenPiece.EMPTY]
        ];

        // When
        const blackResult1: boolean = condition1.canMove(undefined, new Vec2([0, 0]), board);
        const whiteResult1: boolean = condition1.canMove(undefined, new Vec2([1, 0]), board);
        const noneResult1: boolean = condition1.canMove(undefined, new Vec2([2, 0]), board);
        const blackResult2: boolean = condition2.canMove(undefined, new Vec2([0, 0]), board);
        const whiteResult2: boolean = condition2.canMove(undefined, new Vec2([1, 0]), board);
        const noneResult2: boolean = condition2.canMove(undefined, new Vec2([2, 0]), board);
        const blackResult3: boolean = condition3.canMove(undefined, new Vec2([0, 0]), board);
        const whiteResult3: boolean = condition3.canMove(undefined, new Vec2([1, 0]), board);
        const noneResult3: boolean = condition3.canMove(undefined, new Vec2([2, 0]), board);

        // Then
        expect(blackResult1).toBeTruthy();
        expect(whiteResult1).toBeFalsy();
        expect(noneResult1).toBeFalsy();
        expect(blackResult2).toBeFalsy();
        expect(whiteResult2).toBeTruthy();
        expect(noneResult2).toBeFalsy();
        expect(blackResult3).toBeFalsy();
        expect(whiteResult3).toBeFalsy();
        expect(noneResult3).toBeTruthy();
    });
});
