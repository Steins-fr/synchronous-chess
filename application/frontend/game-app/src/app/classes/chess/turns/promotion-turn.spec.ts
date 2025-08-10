import { FenColumn, FenRow, FenCoordinate } from '@app/classes/chess/interfaces/move';
import { PieceType, PieceColor } from '@app/classes/chess/rules/chess-rules';
import PromotionTurn from '@app/classes/chess/turns/promotion-turn';
import Turn from '@app/classes/chess/turns/turn';
import PromotionTurnAction from '@app/classes/chess/turns/turn-actions/promotion-turn-action';
import { describe, test, expect } from 'vitest';

describe('PromotionTurn', () => {
    test('should create an instance', () => {
        expect(new PromotionTurn({
            whiteFenCoordinate: [FenColumn.A, FenRow._1],
            blackFenCoordinate: [FenColumn.A, FenRow._2],
            whitePiece: null,
            blackPiece: null,
        },
        null as unknown as Turn,
        )
        ).toBeTruthy();
    });

    test('canBeExecuted should return false if the action is not filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const turnEmpty: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: fenCoordinate,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);
        const turnOnlyWhite: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: fenCoordinate,
            whitePiece: PieceType.QUEEN,
            blackPiece: null,
        }, null as unknown as Turn);
        const turnOnlyBlack: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: fenCoordinate,
            whitePiece: null,
            blackPiece: PieceType.QUEEN,
        }, null as unknown as Turn);

        // When
        const resultEmpty: boolean = turnEmpty.canBeExecuted();
        const resultOnlyWhite: boolean = turnOnlyWhite.canBeExecuted();
        const resultOnlyBlack: boolean = turnOnlyBlack.canBeExecuted();

        // Then
        expect(resultEmpty).toBeFalsy();
        expect(resultOnlyWhite).toBeFalsy();
        expect(resultOnlyBlack).toBeFalsy();
    });

    test('canBeExecuted should return true if the action is filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const turn: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: fenCoordinate,
            whitePiece: PieceType.QUEEN,
            blackPiece: PieceType.QUEEN,
        }, null as unknown as Turn);

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    test('canBeExecuted should return true if no FenCoordinate', () => {
        // Given

        const turn: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: null,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    test('isFilled should return true on unsupported color', () => {
        // Given
        const turn: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: null,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);

        // When
        const result: boolean = turn.isFilled(PieceColor.NONE);

        // Then
        expect(result).toBeTruthy();
    });

    test('isFilled should return false if partially filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const turnWhite: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);
        const turnBlack: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: null,
            blackFenCoordinate: fenCoordinate,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);

        // When
        const resultWhite: boolean = turnWhite.isFilled(PieceColor.WHITE);
        const resultBlack: boolean = turnBlack.isFilled(PieceColor.BLACK);

        // Then
        expect(resultWhite).toBeFalsy();
        expect(resultBlack).toBeFalsy();
    });

    test('isFilled should return true if filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const turnWhite: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: null,
            whitePiece: PieceType.QUEEN,
            blackPiece: null,
        }, null as unknown as Turn);
        const turnBlack: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: null,
            blackFenCoordinate: fenCoordinate,
            whitePiece: null,
            blackPiece: PieceType.QUEEN,
        }, null as unknown as Turn);

        // When
        const resultWhiteFilled: boolean = turnWhite.isFilled(PieceColor.WHITE);
        const resultWhiteNoPiece: boolean = turnWhite.isFilled(PieceColor.BLACK);
        const resultBlackFilled: boolean = turnBlack.isFilled(PieceColor.BLACK);
        const resultBlackNoPiece: boolean = turnBlack.isFilled(PieceColor.WHITE);

        // Then
        expect(resultWhiteFilled).toBeTruthy();
        expect(resultWhiteNoPiece).toBeTruthy();
        expect(resultBlackFilled).toBeTruthy();
        expect(resultBlackNoPiece).toBeTruthy();
    });

    test('should fill the PieceType in the right color', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whitePiece: PieceType = PieceType.QUEEN;
        const blackPiece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: fenCoordinate,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);
        const initialAction: PromotionTurnAction = { ...turn.action };
        const expectedAction: PromotionTurnAction = {
            whitePiece, blackPiece, whiteFenCoordinate: fenCoordinate, blackFenCoordinate: fenCoordinate
        };

        // When
        turn.registerChoice(whitePiece, PieceColor.WHITE);
        turn.registerChoice(blackPiece, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });

    test('should fill only the white piece', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whitePiece: PieceType = PieceType.QUEEN;
        const blackPiece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: fenCoordinate,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);
        const initialAction: PromotionTurnAction = { ...turn.action };
        const expectedAction: PromotionTurnAction = {
            whitePiece, blackPiece: null, whiteFenCoordinate: fenCoordinate, blackFenCoordinate: null
        };

        // When
        turn.registerChoice(whitePiece, PieceColor.WHITE);
        turn.registerChoice(blackPiece, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });

    test('should fill only the black piece', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whitePiece: PieceType = PieceType.QUEEN;
        const blackPiece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({
            whiteFenCoordinate: null,
            blackFenCoordinate: fenCoordinate,
            whitePiece: null,
            blackPiece: null,
        }, null as unknown as Turn);
        const initialAction: PromotionTurnAction = { ...turn.action };
        const expectedAction: PromotionTurnAction = {
            whitePiece: null, blackPiece, whiteFenCoordinate: null, blackFenCoordinate: fenCoordinate
        };

        // When
        turn.registerChoice(whitePiece, PieceColor.WHITE);
        turn.registerChoice(blackPiece, PieceColor.BLACK);

        // Then
        expect(turn.action).not.toEqual(initialAction);
        expect(turn.action).toEqual(expectedAction);
    });
});
