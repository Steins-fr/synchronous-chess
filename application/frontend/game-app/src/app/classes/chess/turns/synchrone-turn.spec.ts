import SynchroneTurn from './synchrone-turn';
import Turn from './turn';
import TurnType from './turn.types';
import Move, { FenColumn } from '../interfaces/move';
import SynchroneTurnAction from './turn-actions/synchrone-turn-action';
import { PieceColor } from '../rules/chess-rules';

describe('SynchroneTurn', () => {

    it('should create an instance', () => {
        const turn: Turn = new SynchroneTurn();

        expect(turn).toBeTruthy();
        expect(turn.type).toEqual(TurnType.SYNCHRONE);
    });

    it('canBeExecuted should return false if the action is not filled', () => {
        // Given
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turnEmpty: SynchroneTurn = new SynchroneTurn();
        const turnOnlyWhite: SynchroneTurn = new SynchroneTurn();
        turnOnlyWhite.action.whiteMove = move;
        const turnOnlyBlack: SynchroneTurn = new SynchroneTurn();
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

    it('canBeExecuted should return turn if the action is filled', () => {
        // Given
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turn: SynchroneTurn = new SynchroneTurn();
        turn.action.blackMove = move;
        turn.action.whiteMove = move;

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    it('should fill the move in the right color', () => {
        // Given
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const blackMove: Move = { from: [FenColumn.A, 6], to: [FenColumn.B, 5] };
        const turn: SynchroneTurn = new SynchroneTurn();
        const initialAction: SynchroneTurnAction = { ...turn.action };
        const expectedAction: SynchroneTurnAction = {
            whiteMove, blackMove
        };

        // When
        turn.registerMove(whiteMove, PieceColor.WHITE);
        turn.registerMove(blackMove, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });
});
