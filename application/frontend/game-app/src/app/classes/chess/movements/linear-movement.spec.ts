import LinearMovement from '@app/classes/chess/movements/linear-movement';
import { FenPiece } from '@app/classes/chess/enums/fen-piece.enum';
import { Vec2, Vec2Array } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { describe, test, expect } from 'vitest';

describe('LinearMove', () => {
    test('should create an instance', () => {
        expect(LinearMovement.build([1, 1])).toBeTruthy();
    });

    test('should throw vector error', () => {
        expect(() => LinearMovement.build([0, 0])).toThrowError();
        expect(() => LinearMovement.build([1, 2])).toThrowError();
        expect(() => LinearMovement.build([2, 1])).toThrowError();
        expect(() => LinearMovement.build([-4, -4])).toThrowError();
    });

    test('should not throw vector error', () => {
        expect(() => LinearMovement.build([0, 1])).not.toThrowError();
        expect(() => LinearMovement.build([1, 0])).not.toThrowError();
        expect(() => LinearMovement.build([1, 1])).not.toThrowError();
        expect(() => LinearMovement.build([0, -1])).not.toThrowError();
        expect(() => LinearMovement.build([-1, 0])).not.toThrowError();
        expect(() => LinearMovement.build([-1, -1])).not.toThrowError();
    });

    test('should create multiple instance', () => {
        // Given
        const coordinate1: Vec2Array = [1, 0];
        const coordinate2: Vec2Array = [1, 1];
        // When
        const moves: Array<LinearMovement> = LinearMovement.buildAll([coordinate1, coordinate2]);

        // Then
        expect(moves.length).toEqual(2);
    });

    test('should initiate properties', () => {

        // Given
        const coordinate: Vec2Array = [1, 0];

        // When
        const move: LinearMovement = LinearMovement.build(coordinate);

        // Then
        expect(move.vector.equal(1, 0)).toBeTruthy();
    });

    test('should return all valid plays', () => {

        // Given
        const coordinate: Vec2Array = [1, 0];

        const position: Vec2 = new Vec2(0, 0);

        const boardBlack: FenBoard = [
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];
        const boardBlackExpectedPlays: Array<Vec2> = [new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0)];
        const boardWhite: FenBoard = [
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];
        const boardWhiteExpectedPlays: Array<Vec2> = [new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0), new Vec2(4, 0)];

        const boardEmpty: FenBoard = [
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];
        const boardEmptyExpectedPlays: Array<Vec2> = [new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0), new Vec2(4, 0), new Vec2(5, 0), new Vec2(6, 0), new Vec2(7, 0)];

        const move: LinearMovement = LinearMovement.build(coordinate);

        // When
        const boardBlackPlays: Array<Vec2> = move.possiblePlays(position, boardBlack);
        const boardWhitePlays: Array<Vec2> = move.possiblePlays(position, boardWhite);
        const boardEmptyPlays: Array<Vec2> = move.possiblePlays(position, boardEmpty);

        // Then
        expect(boardBlackPlays).toEqual(boardBlackExpectedPlays);
        expect(boardWhitePlays).toEqual(boardWhiteExpectedPlays);
        expect(boardEmptyPlays).toEqual(boardEmptyExpectedPlays);
    });

    test('should throw error if the position was not valid', () => {

        // Given
        const coordinate: Vec2Array = [1, 0];

        const position: Vec2 = new Vec2(0, 0);
        const badPosition: Vec2 = new Vec2(-1, -1);

        const boardFullEmpty: FenBoard = [[FenPiece.EMPTY]];

        const move: LinearMovement = LinearMovement.build(coordinate);

        // When
        const badCall1: () => Array<Vec2> = (): Array<Vec2> => move.possiblePlays(badPosition, boardFullEmpty);
        const badCall2: () => Array<Vec2> = (): Array<Vec2> => move.possiblePlays(position, boardFullEmpty);

        // Then
        expect(badCall1).toThrowError();
        expect(badCall2).toThrowError();
    });
});
