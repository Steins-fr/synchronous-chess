import HopMovement from '@app/classes/chess/movements/hop-movement';
import { FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2, Vec2Array } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/helpers/chess-board-helper';

describe('HopMove', () => {
    it('should create an instance', () => {
        expect(HopMovement.build([2, 2])).toBeTruthy();
    });

    it('should throw vector error', () => {
        expect(() => HopMovement.build([0, 0])).toThrowError();
    });

    it('should not throw vector error', () => {
        expect(() => HopMovement.build([0, 1])).not.toThrowError();
        expect(() => HopMovement.build([1, 0])).not.toThrowError();
        expect(() => HopMovement.build([1, 1])).not.toThrowError();
        expect(() => HopMovement.build([0, -1])).not.toThrowError();
        expect(() => HopMovement.build([-6, -6])).not.toThrowError();
        expect(() => HopMovement.build([-4, 9])).not.toThrowError();
    });

    it('should create multiple instance', () => {
        // Given
        const coordinate1: Vec2Array = [2, 2];
        const coordinate2: Vec2Array = [1, 1];
        // When
        const moves: Array<HopMovement> = HopMovement.buildAll([coordinate1, coordinate2]);

        // Then
        expect(moves.length).toEqual(2);
    });

    it('should initiate properties', () => {

        // Given
        const coordinate: Vec2Array = [34, 4];

        // When
        const move: HopMovement = HopMovement.build(coordinate);

        // Then
        expect(move.vector.equal(34, 4)).toBeTruthy();
    });

    it('should return all valid plays', () => {

        // Given
        const coordinate: Vec2Array = [1, 2];
        const outCoordinate: Vec2Array = [-10, -10];

        const position: Vec2 = new Vec2(0, 0);

        const boardBlack: FenBoard = [
            [FenPiece.BLACK_QUEEN],
            [],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN]
        ];
        const boardBlackExpectedPlays: Array<Vec2> = [];
        const boardWhite: FenBoard = [
            [FenPiece.BLACK_QUEEN],
            [],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN]
        ];
        const boardWhiteExpectedPlays: Array<Vec2> = [new Vec2(1, 2)];

        const boardEmpty: FenBoard = [
            [FenPiece.BLACK_QUEEN],
            [],
            [FenPiece.EMPTY, FenPiece.EMPTY]
        ];
        const boardEmptyExpectedPlays: Array<Vec2> = [new Vec2(1, 2)];

        const [move, outMove]: Array<HopMovement> = HopMovement.buildAll([coordinate, outCoordinate]);

        // When
        const boardBlackPlays: Array<Vec2> = move.possiblePlays(position, boardBlack);
        const boardWhitePlays: Array<Vec2> = move.possiblePlays(position, boardWhite);
        const boardEmptyPlays: Array<Vec2> = move.possiblePlays(position, boardEmpty);
        const boardOutPlays: Array<Vec2> = outMove.possiblePlays(position, boardBlack);

        // Then
        expect(boardBlackPlays).toEqual(boardBlackExpectedPlays);
        expect(boardWhitePlays).toEqual(boardWhiteExpectedPlays);
        expect(boardEmptyPlays).toEqual(boardEmptyExpectedPlays);
        expect(boardOutPlays).toEqual([]);
    });

    it('should throw error if the position was not valid', () => {

        // Given
        const coordinate: Vec2Array = [1, 2];

        const position: Vec2 = new Vec2(0, 0);
        const badPosition: Vec2 = new Vec2(-1, -1);

        const boardFullEmpty: FenBoard = [[FenPiece.EMPTY]];

        const move: HopMovement = HopMovement.build(coordinate);

        // When
        const badCall1: () => Array<Vec2> = (): Array<Vec2> => move.possiblePlays(badPosition, boardFullEmpty);
        const badCall2: () => Array<Vec2> = (): Array<Vec2> => move.possiblePlays(position, boardFullEmpty);

        // Then
        expect(badCall1).toThrowError();
        expect(badCall2).toThrowError();
    });
});
