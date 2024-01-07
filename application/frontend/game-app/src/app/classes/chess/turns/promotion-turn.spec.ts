import PromotionTurn from './promotion-turn';
import { PieceType, PieceColor } from '../rules/chess-rules';
import { FenColumn, FenRow, FenCoordinate } from '../interfaces/move';
import Turn from './turn';
import PromotionTurnAction from './turn-actions/promotion-turn-action';

describe('PromotionTurn', () => {
    it('should create an instance', () => {
        expect(new PromotionTurn({ whiteFenCoordinate: [FenColumn.A, FenRow._1], blackFenCoordinate: [FenColumn.A, FenRow._2] }, null as unknown as Turn)).toBeTruthy();
    });

    it('canBeExecuted should return false if the action is not filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const piece: PieceType = PieceType.QUEEN;
        const turnEmpty: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
        const turnOnlyWhite: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
        turnOnlyWhite.action.whitePiece = piece;
        const turnOnlyBlack: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
        turnOnlyBlack.action.blackPiece = piece;

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

        const piece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
        turn.action.blackPiece = piece;
        turn.action.whitePiece = piece;

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    it('canBeExecuted should return true if no FenCoordinate', () => {
        // Given

        const turn: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: null, blackFenCoordinate: null }, null as unknown as Turn);

        // When
        const result: boolean = turn.canBeExecuted();

        // Then
        expect(result).toBeTruthy();
    });

    it('isFilled should return true on unsupported color', () => {
        // Given
        const turn: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: null, blackFenCoordinate: null }, null as unknown as Turn);

        // When
        const result: boolean = turn.isFilled(PieceColor.NONE);

        // Then
        expect(result).toBeTruthy();
    });

    it('isFilled should return false if partially filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const turnWhite: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: null }, null as unknown as Turn);
        const turnBlack: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: null, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);

        // When
        const resultWhite: boolean = turnWhite.isFilled(PieceColor.WHITE);
        const resultBlack: boolean = turnBlack.isFilled(PieceColor.BLACK);

        // Then
        expect(resultWhite).toBeFalsy();
        expect(resultBlack).toBeFalsy();
    });

    it('isFilled should return true if filled', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];

        const piece: PieceType = PieceType.QUEEN;
        const turnWhite: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: null }, null as unknown as Turn);
        turnWhite.action.whitePiece = piece;
        const turnBlack: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: null, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
        turnBlack.action.blackPiece = piece;

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

    it('should fill the PieceType in the right color', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whitePiece: PieceType = PieceType.QUEEN;
        const blackPiece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
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

    it('should fill only the white piece', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whitePiece: PieceType = PieceType.QUEEN;
        const blackPiece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: fenCoordinate, blackFenCoordinate: null }, null as unknown as Turn);
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

    it('should fill only the black piece', () => {
        // Given
        const fenCoordinate: FenCoordinate = [FenColumn.A, 3];
        const whitePiece: PieceType = PieceType.QUEEN;
        const blackPiece: PieceType = PieceType.QUEEN;
        const turn: PromotionTurn = new PromotionTurn({ whiteFenCoordinate: null, blackFenCoordinate: fenCoordinate }, null as unknown as Turn);
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
