import ConditionalMove, { ConditionalMoveConfiguration } from './conditional-move';
import Vec2 from 'vec2';
import { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece, PieceColor } from '../piece/piece';
import HopMove from './hop-move';
import Move from './move';
import DestinationColorMoveCondition from './move-conditions/destination-color-move-condition';

describe('ConditionalMove', () => {
    it('should create an instance', () => {
        expect(ConditionalMove.buildOne({ move: undefined, conditions: [] })).toBeTruthy();
    });

    it('should create multiple instance', () => {
        // Given
        const configuration1: ConditionalMoveConfiguration = { move: undefined, conditions: [] };
        const configuration2: ConditionalMoveConfiguration = { move: undefined, conditions: [] };
        // When
        const moves: Array<ConditionalMove> = ConditionalMove.build(configuration1, configuration2);

        // Then
        expect(moves.length).toEqual(2);
        expect(moves.every((move: ConditionalMove) => move instanceof ConditionalMove));
    });

    it('should initiate properties', () => {

        // Given
        const move: Move = HopMove.build([1, 1]).shift();
        const configuration: ConditionalMoveConfiguration = { move, conditions: [] };

        // When
        const [conditionalMove]: Array<ConditionalMove> = ConditionalMove.build(configuration);

        // Then
        expect(conditionalMove.move).toEqual(move);
        expect(conditionalMove.conditions).toEqual([]);
    });

    it('should return all valid plays', () => {

        // Given
        const move: Move = HopMove.build([1, 1]).shift();

        const position: Vec2 = new Vec2(0, 0);

        const board: FenBoard = [
            [FenPiece.BLACK_QUEEN],
            [FenPiece.EMPTY, FenPiece.WHITE_KING]
        ];

        const conditionalMoveValid: ConditionalMove = ConditionalMove.buildOne({
            move, conditions: [
                new DestinationColorMoveCondition(PieceColor.WHITE)
            ]
        });
        const conditionalMoveValidExpectedPlays: Array<Vec2> = [new Vec2([1, 1])];

        const conditionalMoveInvalid: ConditionalMove = ConditionalMove.buildOne({
            move, conditions: [
                new DestinationColorMoveCondition(PieceColor.BLACK)
            ]
        });

        const conditionalMoveInvalidExpectedPlays: Array<Vec2> = [];

        // When
        const conditionalMoveValidPlays: Array<Vec2> = conditionalMoveValid.possiblePlays(position, board);
        const conditionalMoveInvalidPlays: Array<Vec2> = conditionalMoveInvalid.possiblePlays(position, board);

        // Then
        expect(conditionalMoveValidPlays).toEqual(conditionalMoveValidExpectedPlays);
        expect(conditionalMoveInvalidPlays).toEqual(conditionalMoveInvalidExpectedPlays);
    });
});
