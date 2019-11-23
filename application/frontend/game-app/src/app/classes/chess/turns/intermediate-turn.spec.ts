import { IntermediateTurn } from './intermediate-turn';
import Move, { FenColumn, FenCoordinate } from '../interfaces/move';
import Turn from './turn';
import TurnType from './turn.types';
import { PieceColor } from '../rules/chess-rules';
import IntermediateTurnAction from './turn-actions/intermediate-turn-action';

describe('IntermediateTurn', () => {
    it('should create an instance', () => {
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const turn: Turn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: fenCoordinate });

        expect(turn).toBeTruthy();
        expect(turn.type).toEqual(TurnType.INTERMEDIATE);
    });

    it('canBeExecuted should return false if the action is not filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turnEmpty: IntermediateTurn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: fenCoordinate });
        const turnOnlyWhite: IntermediateTurn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: fenCoordinate });
        turnOnlyWhite.action.whiteMove = move;
        const turnOnlyBlack: IntermediateTurn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: fenCoordinate });
        turnOnlyBlack.action.blackMove = move;

        // When
        const resultEmpty: boolean = turnEmpty.canBeExecuted();
        const resultOnlyWhite: boolean = turnOnlyWhite.canBeExecuted();
        const resultOnlyBlack: boolean = turnOnlyBlack.canBeExecuted();

        // Then
        expect(resultEmpty).toBeFalsy();
        expect(resultOnlyWhite).toBeFalsy();
        expect(resultOnlyBlack).toBeFalsy();
    });

    it('canBeExecuted should return true if the action is filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turn: IntermediateTurn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: fenCoordinate });
        turn.action.blackMove = move;
        turn.action.whiteMove = move;

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    it('canBeExecuted should return true if no target', () => {
        // Given

        const turn: IntermediateTurn = new IntermediateTurn({ whiteTarget: null, blackTarget: null });

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    it('isFilled should return true on unsupported color', () => {
        // Given
        const turn: IntermediateTurn = new IntermediateTurn({ whiteTarget: null, blackTarget: null });

        // When
        const result: boolean = turn.isFilled(PieceColor.NONE);

        // Then
        expect(result).toBeTruthy();
    });

    it('isFilled should return false if partially filled', () => {
        // Given
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turnWhite: IntermediateTurn = new IntermediateTurn({ whiteTarget: move.to, blackTarget: null });
        const turnBlack: IntermediateTurn = new IntermediateTurn({ whiteTarget: null, blackTarget: move.to });

        // When
        const resultWhite: boolean = turnWhite.isFilled(PieceColor.WHITE);
        const resultBlack: boolean = turnBlack.isFilled(PieceColor.BLACK);

        // Then
        expect(resultWhite).toBeFalsy();
        expect(resultBlack).toBeFalsy();
    });

    it('isFilled should return true if filled', () => {
        // Given
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turnWhite: IntermediateTurn = new IntermediateTurn({ whiteTarget: move.to, blackTarget: null });
        turnWhite.action.whiteMove = move;
        const turnBlack: IntermediateTurn = new IntermediateTurn({ whiteTarget: null, blackTarget: move.to });
        turnBlack.action.blackMove = move;

        // When
        const resultWhiteFilled: boolean = turnWhite.isFilled(PieceColor.WHITE);
        const resultWhiteNoMove: boolean = turnWhite.isFilled(PieceColor.BLACK);
        const resultBlackFilled: boolean = turnBlack.isFilled(PieceColor.BLACK);
        const resultBlackNoMove: boolean = turnBlack.isFilled(PieceColor.WHITE);

        // Then
        expect(resultWhiteFilled).toBeTruthy();
        expect(resultWhiteNoMove).toBeTruthy();
        expect(resultBlackFilled).toBeTruthy();
        expect(resultBlackNoMove).toBeTruthy();
    });

    it('should fill the move in the right color', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const blackMove: Move = { from: [FenColumn.A, 6], to: [FenColumn.B, 5] };
        const turn: IntermediateTurn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: fenCoordinate });
        const initialAction: IntermediateTurnAction = { ...turn.action };
        const expectedAction: IntermediateTurnAction = {
            whiteMove, blackMove, whiteTarget: fenCoordinate, blackTarget: fenCoordinate
        };

        // When
        turn.registerMove(whiteMove, PieceColor.WHITE);
        turn.registerMove(blackMove, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });

    it('should fill only the white move', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const blackMove: Move = { from: [FenColumn.A, 6], to: [FenColumn.B, 5] };
        const turn: IntermediateTurn = new IntermediateTurn({ whiteTarget: fenCoordinate, blackTarget: null });
        const initialAction: IntermediateTurnAction = { ...turn.action };
        const expectedAction: IntermediateTurnAction = {
            whiteMove, blackMove: null, whiteTarget: fenCoordinate, blackTarget: null
        };

        // When
        turn.registerMove(whiteMove, PieceColor.WHITE);
        turn.registerMove(blackMove, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });

    it('should fill only the black move', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const blackMove: Move = { from: [FenColumn.A, 6], to: [FenColumn.B, 5] };
        const turn: IntermediateTurn = new IntermediateTurn({ whiteTarget: null, blackTarget: fenCoordinate });
        const initialAction: IntermediateTurnAction = { ...turn.action };
        const expectedAction: IntermediateTurnAction = {
            whiteMove: null, blackMove, whiteTarget: null, blackTarget: fenCoordinate
        };

        // When
        turn.registerMove(whiteMove, PieceColor.WHITE);
        turn.registerMove(blackMove, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });
});
