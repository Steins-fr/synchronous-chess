import FearHopMove, { FearHopMoveObject } from './fear-hop-move';
import { FenPiece } from '../piece/piece';
import Vec2 from 'vec2';
import { FenBoard } from 'src/app/helpers/chess-helper';

describe('FearHopMove', () => {
    it('should create an instance', () => {
        expect(FearHopMove.build({ vector: [2, 2], dontApproche: FenPiece.BLACK_BISHOP })).toBeTruthy();
    });

    it('should throw vector error', () => {
        expect(() => FearHopMove.build({ vector: [0, 0], dontApproche: FenPiece.BLACK_BISHOP })).toThrowError();
    });

    it('should not throw vector error', () => {
        expect(() => FearHopMove.build({ vector: [0, 1], dontApproche: FenPiece.BLACK_BISHOP })).not.toThrowError();
        expect(() => FearHopMove.build({ vector: [1, 0], dontApproche: FenPiece.BLACK_BISHOP })).not.toThrowError();
        expect(() => FearHopMove.build({ vector: [1, 1], dontApproche: FenPiece.BLACK_BISHOP })).not.toThrowError();
        expect(() => FearHopMove.build({ vector: [0, -1], dontApproche: FenPiece.BLACK_BISHOP })).not.toThrowError();
        expect(() => FearHopMove.build({ vector: [-6, -6], dontApproche: FenPiece.BLACK_BISHOP })).not.toThrowError();
        expect(() => FearHopMove.build({ vector: [-4, 9], dontApproche: FenPiece.BLACK_BISHOP })).not.toThrowError();
    });

    it('should create multiple instance', () => {
        // Given
        const configuration1: FearHopMoveObject = { vector: [2, 2], dontApproche: FenPiece.BLACK_BISHOP };
        const configuration2: FearHopMoveObject = { vector: [1, 1], dontApproche: FenPiece.BLACK_BISHOP };
        // When
        const moves: Array<FearHopMove> = FearHopMove.build(configuration1, configuration2);

        // Then
        expect(moves.length).toEqual(2);
        expect(moves.every((move: FearHopMove) => move instanceof FearHopMove));
    });

    it('should initiate properties', () => {

        // Given
        const configuration: FearHopMoveObject = { vector: [32, 4], dontApproche: FenPiece.BLACK_BISHOP };

        // When
        const [move]: Array<FearHopMove> = FearHopMove.build(configuration);

        // Then
        expect(move.vector.equal(32, 4)).toBeTruthy();
        expect(move.dontApproche).toEqual(FenPiece.BLACK_BISHOP);
    });

    it('should return all valid plays', () => {

        // Given
        const configuration1: FearHopMoveObject = { vector: [1, 0], dontApproche: FenPiece.WHITE_KING };
        const configuration2: FearHopMoveObject = { vector: [1, 1], dontApproche: FenPiece.WHITE_KING };
        const outConfiguration: FearHopMoveObject = { vector: [-10, -10], dontApproche: FenPiece.WHITE_KING };

        const position: Vec2 = new Vec2(0, 0);

        // The black king can't run on his pawns
        const boardBlack: FenBoard = [
            [FenPiece.BLACK_KING, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN]
        ];
        const boardBlackExpectedPlays1: Array<Vec2> = [];
        const boardBlackExpectedPlays2: Array<Vec2> = [];

        // The black king can eat opponent pawns
        const boardWhite: FenBoard = [
            [FenPiece.BLACK_KING, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN]
        ];
        const boardWhiteExpectedPlays1: Array<Vec2> = [new Vec2(1, 0)];
        const boardWhiteExpectedPlays2: Array<Vec2> = [new Vec2(1, 1)];

        // The black king has free move when empty
        const boardEmpty: FenBoard = [
            [FenPiece.BLACK_KING, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY]
        ];
        const boardEmptyExpectedPlays1: Array<Vec2> = [new Vec2(1, 0)];
        const boardEmptyExpectedPlays2: Array<Vec2> = [new Vec2(1, 1)];

        // The black king can't approche the white king
        const boardFeared: FenBoard = [
            [FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.WHITE_KING],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING]
        ];
        const boardFearedExpectedPlays1: Array<Vec2> = [];
        const boardFearedExpectedPlays2: Array<Vec2> = [];

        const [move1, move2, outMove]: Array<FearHopMove> = FearHopMove.build(configuration1, configuration2, outConfiguration);

        // When
        const boardBlackPlays1: Array<Vec2> = move1.possiblePlays(position, boardBlack);
        const boardWhitePlays1: Array<Vec2> = move1.possiblePlays(position, boardWhite);
        const boardEmptyPlays1: Array<Vec2> = move1.possiblePlays(position, boardEmpty);
        const boardBlackPlays2: Array<Vec2> = move2.possiblePlays(position, boardBlack);
        const boardWhitePlays2: Array<Vec2> = move2.possiblePlays(position, boardWhite);
        const boardEmptyPlays2: Array<Vec2> = move2.possiblePlays(position, boardEmpty);

        const boardFearedPlays1: Array<Vec2> = move2.possiblePlays(position, boardFeared);
        const boardFearedPlays2: Array<Vec2> = move2.possiblePlays(position, boardFeared);
        const boardOutPlays: Array<Vec2> = outMove.possiblePlays(position, boardBlack);

        // Then
        expect(boardBlackPlays1).toEqual(boardBlackExpectedPlays1);
        expect(boardWhitePlays1).toEqual(boardWhiteExpectedPlays1);
        expect(boardEmptyPlays1).toEqual(boardEmptyExpectedPlays1);
        expect(boardBlackPlays2).toEqual(boardBlackExpectedPlays2);
        expect(boardWhitePlays2).toEqual(boardWhiteExpectedPlays2);
        expect(boardEmptyPlays2).toEqual(boardEmptyExpectedPlays2);
        expect(boardFearedPlays1).toEqual(boardFearedExpectedPlays1);
        expect(boardFearedPlays2).toEqual(boardFearedExpectedPlays2);
        expect(boardOutPlays).toEqual([]);
    });

    it('should throw error if the position was not valid', () => {

        // Given
        const configuration1: FearHopMoveObject = { vector: [1, 0], dontApproche: FenPiece.WHITE_KING };

        const position: Vec2 = new Vec2(0, 0);
        const badPosition: Vec2 = new Vec2(-1, -1);

        const boardFullEmpty: FenBoard = [[FenPiece.EMPTY]];


        const [move]: Array<FearHopMove> = FearHopMove.build(configuration1);

        // When
        const badCall1: () => Array<Vec2> = (): Array<Vec2> => move.possiblePlays(badPosition, boardFullEmpty);
        const badCall2: () => Array<Vec2> = (): Array<Vec2> => move.possiblePlays(position, boardFullEmpty);

        // Then
        expect(badCall1).toThrowError();
        expect(badCall2).toThrowError();
    });
});
