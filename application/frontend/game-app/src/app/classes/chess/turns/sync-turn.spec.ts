import Move, { FenColumn } from '@app/classes/chess/interfaces/move';
import { PieceColor } from '@app/classes/chess/rules/chess-rules';
import SyncTurn from '@app/classes/chess/turns/sync-turn';
import Turn from '@app/classes/chess/turns/turn';
import SyncTurnAction from '@app/classes/chess/turns/turn-actions/sync-turn-action';
import TurnType from '@app/classes/chess/turns/turn.types';

describe('SyncTurn', () => {

    it('should create an instance', () => {
        const turn: Turn = new SyncTurn();

        expect(turn).toBeTruthy();
        expect(turn.type).toEqual(TurnType.MOVE_SYNC);
    });

    it('canBeExecuted should return false if the action is not filled', () => {
        // Given
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.B, 4] };
        const turnEmpty: SyncTurn = new SyncTurn();
        const turnOnlyWhite: SyncTurn = new SyncTurn();
        turnOnlyWhite.action.whiteMove = move;
        const turnOnlyBlack: SyncTurn = new SyncTurn();
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
        const turn: SyncTurn = new SyncTurn();
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
        const turn: SyncTurn = new SyncTurn();
        const initialAction: SyncTurnAction = { ...turn.action };
        const expectedAction: SyncTurnAction = {
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
