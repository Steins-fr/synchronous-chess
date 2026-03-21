import { vi, describe, test, expect } from 'vitest';
import SynchronousChessGame from '@app/modules/chess/classes/games/synchronous-chess-game';
import { Column, Row } from '@app/modules/chess/interfaces/CoordinateMove';
import Move, { FenColumn, FenCoordinate, FenRow } from '@app/modules/chess/interfaces/move';
import ChessRules from '@app/modules/chess/classes/rules/chess-rules';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { PieceType } from '@app/modules/chess/enums/piece-type.enum';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import SynchronousChessRules from '@app/modules/chess/classes/rules/synchronous-chess-rules';
import ChoiceTurn from '@app/modules/chess/classes/turns/choice-turn';
import { IntermediateTurn } from '@app/modules/chess/classes/turns/intermediate-turn';
import MoveTurn from '@app/modules/chess/classes/turns/move-turn';
import PromotionTurn from '@app/modules/chess/classes/turns/promotion-turn';
import SyncTurn from '@app/modules/chess/classes/turns/sync-turn';
import Turn from '@app/modules/chess/classes/turns/turn';
import IntermediateTurnAction from '@app/modules/chess/classes/turns/turn-actions/intermediate-turn-action';
import PromotionTurnAction from '@app/modules/chess/classes/turns/turn-actions/promotion-turn-action';
import SyncTurnAction from '@app/modules/chess/classes/turns/turn-actions/sync-turn-action';
import TurnType, { TurnCategory } from '@app/modules/chess/classes/turns/turn.types';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { TestHelper } from '@testing/test.helper';

class ProtectedTest extends SynchronousChessGame {
    public override runSyncTurn(): void {
        super.runSyncTurn();
    }

    public override runIntermediateTurn(): void {
        super.runIntermediateTurn();
    }

    public override nextTurn(): void {
        super.nextTurn();
    }

    public override getRules(color: PieceColor): SynchronousChessRules {
        return super.getRules(color);
    }

    public override isTurnValid(): boolean {
        return super.isTurnValid();
    }

    public override getIntermediateTurnPossiblePlays(possiblePlays: Array<Vec2>, position: Vec2): Array<Vec2> {
        return super.getIntermediateTurnPossiblePlays(possiblePlays, position);
    }

    public override canPromote(move: Move | null): boolean {
        return super.canPromote(move);
    }

    public override checkPromotionTurn(): void {
        super.checkPromotionTurn();
    }

    public override runPromotionTurn(): void {
        super.runPromotionTurn();
    }

    public override verifyCheck(): void {
        super.verifyCheck();
    }

    public getTurn(): Turn {
        return this.turn;
    }

    public getOldTurn(): Turn | null {
        return this.oldTurn;
    }
}

describe('SynchronousChessGame', () => {
    test('should get the rules for a specific color', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const white: PieceColor = PieceColor.WHITE;
        const black: PieceColor = PieceColor.BLACK;

        // When
        const whiteRules: ChessRules = game.getRules(white);
        const blackRules: ChessRules = game.getRules(black);

        // Then
        expect(whiteRules).toBe(game.whiteRules);
        expect(blackRules).toBe(game.blackRules);
    });

    test('should get the last turn action of move category', () => {
        const gameUndefinedOldTurn: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(gameUndefinedOldTurn, 'oldTurn', {
            value: undefined,
        });
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        const gameMoveTurn: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(gameMoveTurn, 'oldTurn', {
            value: moveTurnSpy,
        });
        const gameChoiceTurn: SynchronousChessGame = new SynchronousChessGame();
        const choiceTurnSpy = {
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {},
            type: TurnType.CHOICE_PROMOTION,
            category: TurnCategory.CHOICE,
            nextTurn: {
                canBeExecuted: vi.fn(),
                isFilled: vi.fn(),
                isDone: false,
                action: {},
                type: TurnType.MOVE_SYNC,
                category: TurnCategory.MOVE,
            } as Turn,
        } as ChoiceTurn;
        Object.defineProperty(gameChoiceTurn, 'oldTurn', {
            value: choiceTurnSpy,
        });

        expect(gameUndefinedOldTurn.lastMoveTurnAction()).toEqual(null);
        expect(gameMoveTurn.lastMoveTurnAction()).toBe(moveTurnSpy.action);
        expect(gameChoiceTurn.lastMoveTurnAction()).toEqual(null);
    });

    test('getPossiblePlays should return the piece possible plays', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();

        const position: Vec2 = new Vec2(Column.B, Row._8);

        const boardExpectedPlays: Array<Vec2> = [
            new Vec2(Column.C, Row._6),
            new Vec2(Column.A, Row._6)
        ];

        // When
        const boardPlays: Array<Vec2> = game.getPossiblePlays(position);

        // Then
        expect(boardPlays).toEqual(boardExpectedPlays);
    });

    test('getPossiblePlays should return empty during choice turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const choiceTurnSpy = {
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {},
            type: TurnType.CHOICE_PROMOTION,
            category: TurnCategory.CHOICE,
            nextTurn: {
                canBeExecuted: vi.fn(),
                isFilled: vi.fn(),
                isDone: false,
                action: {},
                type: TurnType.MOVE_SYNC,
                category: TurnCategory.MOVE,
            } as Turn,
        } as ChoiceTurn;
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy
        });
        const position: Vec2 = new Vec2(Column.B, Row._8);

        const boardExpectedPlays: Array<Vec2> = [];

        // When
        const boardPlays: Array<Vec2> = game.getPossiblePlays(position);

        // Then
        expect(boardPlays).toEqual(boardExpectedPlays);
    });

    test('should register move if it is valid', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const isMoveValidSpy = vi.fn().mockName('isMoveValid');
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: false
        });
        game.isMoveValid = isMoveValidSpy;
        isMoveValidSpy.mockReturnValue(true);
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 5] };
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.registerMove(move, color);

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.registerMove).toHaveBeenCalledTimes(1);
        expect(isMoveValidSpy).toHaveBeenCalledTimes(1);
    });

    test('should not register move if it is invalid', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const isMoveValidSpy = vi.fn();
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: false
        });
        game.isMoveValid = isMoveValidSpy;
        isMoveValidSpy.mockReturnValue(false);
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 5] };
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.registerMove(move, color);

        // Then
        expect(result).toEqual(false);
        expect(moveTurnSpy.registerMove).not.toHaveBeenCalled();
        expect(isMoveValidSpy).toHaveBeenCalledTimes(1);
    });

    test('registerMove should not skip move if in check', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        game.isWhiteInCheck = true;
        game.isBlackInCheck = true;

        // When
        const resultWhite: boolean = game.registerMove(null, PieceColor.WHITE);
        const resultBlack: boolean = game.registerMove(null, PieceColor.BLACK);

        // Then
        expect(resultWhite).toEqual(false);
        expect(resultBlack).toEqual(false);
    });

    test('should not register move if this is not a move turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const choiceTurnSpy = {
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {},
            type: TurnType.CHOICE_PROMOTION,
            category: TurnCategory.CHOICE,
            nextTurn: {
                canBeExecuted: vi.fn(),
                isFilled: vi.fn(),
                isDone: false,
                action: {},
                type: TurnType.MOVE_SYNC,
                category: TurnCategory.MOVE,
            } as Turn,
        } as ChoiceTurn;
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy,
            writable: false
        });
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 5] };
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.registerMove(move, color);

        // Then
        expect(result).toEqual(false);
    });

    test('should not promote if this is not a promotion turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: false
        });
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.promote(PieceType.QUEEN, color);

        // Then
        expect(result).toEqual(false);
    });

    test('should promote if this is a promotion turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const choiceTurnSpy = TestHelper.cast<ChoiceTurn>({
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            type: TurnType.CHOICE_PROMOTION,
            isDone: false,
            action: {},
            category: TurnCategory.CHOICE,
        });
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy,
            writable: false
        });
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.promote(PieceType.QUEEN, color);

        // Then
        expect(result).toEqual(true);
        expect(choiceTurnSpy.registerChoice).toHaveBeenCalledTimes(1);
    });

    test('isMoveValid should return false if origin is empty', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: false
        });
        const move: Move = { from: [FenColumn.D, 4], to: [FenColumn.F, 5] };

        // When
        const result: boolean = game.isMoveValid(move);

        // Then
        expect(result).toEqual(false);
    });

    test('isTurnValid should return false if the turn type is unknown', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const runSynchroneTurnSpy = vi.fn();
        Object.defineProperty(game, 'runSynchroneTurn', {
            value: runSynchroneTurnSpy,
            writable: false
        });
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: 'unknownType' as TurnType,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        // When
        const result: boolean = game.isTurnValid();

        // Then
        expect(result).toEqual(false);
    });

    test('should not execute the turn if not ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        vi.mocked(moveTurnSpy.canBeExecuted).mockReturnValue(false);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(false);
        expect(moveTurnSpy.canBeExecuted).toHaveBeenCalledTimes(1);
        expect(moveTurnSpy.isDone).toEqual(false);
    });

    test('should execute runSynchroneTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runSyncTurnSpy = vi.fn();
        const nextTurnSpy = vi.fn();
        const checkPromotionTurnSpy = vi.fn();
        const verifyCheckSpy = vi.fn();
        Object.defineProperty(game, 'nextTurn', {
            value: nextTurnSpy
        });
        Object.defineProperty(game, 'verifyCheck', {
            value: verifyCheckSpy
        });
        Object.defineProperty(game, 'checkPromotionTurn', {
            value: checkPromotionTurnSpy
        });
        Object.defineProperty(game, 'runSyncTurn', {
            value: runSyncTurnSpy
        });
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });
        vi.mocked(moveTurnSpy.canBeExecuted).mockReturnValue(true);
        moveTurnSpy.isDone = false;

        const result: boolean = game.runTurn();

        expect(result).toEqual(true);
        expect(moveTurnSpy.canBeExecuted).toHaveBeenCalledTimes(1);
        expect(runSyncTurnSpy).toHaveBeenCalledTimes(1);
        expect(moveTurnSpy.isDone).toEqual(true);
    });

    test('should execute runIntermediateTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runIntermediateTurnSpy = vi.fn();
        const nextTurnSpy = vi.fn();
        const checkPromotionTurnSpy = vi.fn();
        const verifyCheckSpy = vi.fn();
        Object.defineProperty(game, 'nextTurn', {
            value: nextTurnSpy
        });
        Object.defineProperty(game, 'verifyCheck', {
            value: verifyCheckSpy
        });
        Object.defineProperty(game, 'checkPromotionTurn', {
            value: checkPromotionTurnSpy
        });
        Object.defineProperty(game, 'runIntermediateTurn', {
            value: runIntermediateTurnSpy,
            writable: false
        });
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: TurnType.MOVE_INTERMEDIATE,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        vi.mocked(moveTurnSpy.canBeExecuted).mockReturnValue(true);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.canBeExecuted).toHaveBeenCalledTimes(1);
        expect(runIntermediateTurnSpy).toHaveBeenCalledTimes(1);
        expect(moveTurnSpy.isDone).toEqual(true);
    });

    test('should execute PromotionTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runPromotionTurnSpy = vi.fn();
        const nextTurnSpy = vi.fn();
        const checkPromotionTurnSpy = vi.fn();
        const verifyCheckSpy = vi.fn();
        Object.defineProperty(game, 'nextTurn', {
            value: nextTurnSpy
        });
        Object.defineProperty(game, 'verifyCheck', {
            value: verifyCheckSpy
        });
        Object.defineProperty(game, 'checkPromotionTurn', {
            value: checkPromotionTurnSpy
        });
        Object.defineProperty(game, 'runPromotionTurn', {
            value: runPromotionTurnSpy,
            writable: false
        });
        const choiceTurnSpy = TestHelper.cast<ChoiceTurn>({
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            type: TurnType.CHOICE_PROMOTION,
            isDone: false,
            action: {},
            category: TurnCategory.CHOICE,
        });
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy,
            writable: true
        });
        vi.mocked(choiceTurnSpy.canBeExecuted).mockReturnValue(true);
        choiceTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(choiceTurnSpy.canBeExecuted).toHaveBeenCalledTimes(1);
        expect(runPromotionTurnSpy).toHaveBeenCalledTimes(1);
        expect(choiceTurnSpy.isDone).toEqual(true);
    });

    test('should change turn if executed', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const runMoveSpy = vi.fn();
        const checkPromotionTurnSpy = vi.fn();
        const verifyCheckSpy = vi.fn();
        Object.defineProperty(game, 'verifyCheck', {
            value: verifyCheckSpy
        });
        Object.defineProperty(game, 'checkPromotionTurn', {
            value: checkPromotionTurnSpy
        });
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {
                whiteMove: null,
                blackMove: null,
            },
            type: '' as TurnType,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        Object.defineProperty(game, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        vi.mocked(moveTurnSpy.canBeExecuted).mockReturnValue(true);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.canBeExecuted).toHaveBeenCalledTimes(1);
        expect(runMoveSpy).toHaveBeenCalledTimes(0);
        expect(moveTurnSpy.isDone).toEqual(true);
        expect(game.getTurn()).not.toBe(moveTurnSpy);
    });

    test('runSynchroneTurn should not apply a bad play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const move1: Move = { from: [FenColumn.B, 8], to: [FenColumn.D, 7] };
        const move2: Move = { from: [FenColumn.D, 5], to: [FenColumn.D, 7] };

        const action: SyncTurnAction = { whiteMove: move1, blackMove: move2 };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();

        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should apply a valid play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.C, 6] };
        const whiteMove: Move = { from: [FenColumn.B, 1], to: [FenColumn.C, 3] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should pass move', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const action: SyncTurnAction = { whiteMove: null, blackMove: null };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should double capture', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 4] };
        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 4] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should double capture with black king surviving', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 5], to: [FenColumn.A, 4] };
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 4] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should double capture with white king surviving', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 5], to: [FenColumn.A, 4] };
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 4] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.EMPTY, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.EMPTY, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should exchange places', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 1] };
        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 8] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should move only the white piece', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 8] };

        const action: SyncTurnAction = { whiteMove, blackMove: null };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runSynchroneTurn should move only the black piece', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 1] };

        const action: SyncTurnAction = { whiteMove: null, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runSyncTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runIntermediateTurn should not apply a bad play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.D, 7] };
        const blackMove: Move = { from: [FenColumn.D, 5], to: [FenColumn.D, 7] };

        const action: IntermediateTurnAction = {
            whiteMove,
            blackMove,
            whiteTarget: whiteMove.from,
            blackTarget: blackMove.from
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_INTERMEDIATE,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runIntermediateTurn();

        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runIntermediateTurn should apply a valid play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.C, 6] };
        const whiteMove: Move = { from: [FenColumn.B, 1], to: [FenColumn.C, 3] };

        const action: IntermediateTurnAction = {
            whiteMove,
            blackMove,
            whiteTarget: whiteMove.to,
            blackTarget: blackMove.to
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_INTERMEDIATE,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runIntermediateTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runIntermediateTurn should pass moves', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.C, 6] };
        const whiteMove: Move = { from: [FenColumn.B, 1], to: [FenColumn.C, 3] };

        const action: IntermediateTurnAction = {
            whiteMove: null,
            blackMove: null,
            whiteTarget: whiteMove.to,
            blackTarget: blackMove.to
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_INTERMEDIATE,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When
        const initBoard: FenBoard = game.fenBoard;
        game.runIntermediateTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('should apply king single move', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.E, 8], to: [FenColumn.E, 7] };
        const whiteMove: Move = { from: [FenColumn.E, 1], to: [FenColumn.E, 2] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoard);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_KING, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_KING, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.EMPTY, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable();
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable();

        // When
        game.runSyncTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable()).toBeFalsy();
        expect(game.blackRules.isQueenSideCastleAvailable()).toBeFalsy();
    });

    test('should apply king castling', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.E, 8], to: [FenColumn.G, 8] };
        const whiteMove: Move = { from: [FenColumn.A, 2], to: [FenColumn.A, 3] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KNIGHT],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoard);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.BLACK_ROOK, FenPiece.BLACK_KING, FenPiece.EMPTY],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_BISHOP, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KNIGHT],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable();
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable();

        // When
        game.runSyncTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable()).toBeFalsy();
        expect(game.blackRules.isQueenSideCastleAvailable()).toBeFalsy();
    });

    test('should disable king side castling', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.H, 8], to: [FenColumn.H, 7] };
        const whiteMove: Move = { from: [FenColumn.A, 2], to: [FenColumn.A, 3] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoard);

        const expectedFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.EMPTY],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable();
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable();

        // When
        game.runSyncTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable()).toBeFalsy();
        expect(game.blackRules.isQueenSideCastleAvailable()).toBeTruthy();
    });

    test('should disable queen side castling', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 7] };
        const whiteMove: Move = { from: [FenColumn.A, 2], to: [FenColumn.A, 3] };

        const action: SyncTurnAction = { whiteMove, blackMove };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoard);

        const expectedFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable();
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable();

        // When
        game.runSyncTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable()).toBeTruthy();
        expect(game.blackRules.isQueenSideCastleAvailable()).toBeFalsy();
    });

    test('nextTurn should create an intermediate turn', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };
        const whiteMove: Move = { from: [FenColumn.F, 2], to: [FenColumn.F, 4] };

        const action: SyncTurnAction = { whiteMove, blackMove };
        const expectedAction: IntermediateTurnAction = {
            whiteTarget: blackMove.to,
            blackTarget: whiteMove.to,
            blackMove: null,
            whiteMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const oldFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const newFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        Object.defineProperty(game, '_oldFenBoard', {
            value: oldFenBoard
        });

        Object.defineProperty(game, '_fenBoard', {
            value: newFenBoard
        });

        // When
        game.nextTurn();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.MOVE_INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    test('nextTurn should create an intermediate turn for the white', () => {
        // Given
        ChessBoardHelper.disableCache();

        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };

        const action: SyncTurnAction = { whiteMove: null, blackMove };
        const expectedAction: IntermediateTurnAction = {
            whiteTarget: blackMove.to,
            blackTarget: null,
            whiteMove: null,
            blackMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const oldFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const newFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        Object.defineProperty(game, '_oldFenBoard', {
            value: oldFenBoard
        });

        Object.defineProperty(game, '_fenBoard', {
            value: newFenBoard
        });

        // When
        game.nextTurn();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.MOVE_INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    test('nextTurn should create an intermediate turn for the black', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.F, 2], to: [FenColumn.F, 4] };

        const action: SyncTurnAction = { whiteMove, blackMove: null };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const oldFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const newFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        Object.defineProperty(game, '_oldFenBoard', {
            value: oldFenBoard
        });

        Object.defineProperty(game, '_fenBoard', {
            value: newFenBoard
        });

        // When
        game.nextTurn();
        // Then
        const expectedAction: IntermediateTurnAction = {
            whiteTarget: null,
            blackTarget: whiteMove.to,
            whiteMove: null,
            blackMove: null,
        };

        expect(game.getTurn().type).toEqual(TurnType.MOVE_INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    test('nextTurn should create a synchrone turn because both has moved', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };
        const whiteMove: Move = { from: [FenColumn.B, 2], to: [FenColumn.B, 4] };

        const action: SyncTurnAction = { whiteMove, blackMove };
        const expectedAction: SyncTurnAction = {
            whiteMove: null,
            blackMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: true,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const oldFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const newFenBoard: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        Object.defineProperty(game, '_oldFenBoard', {
            value: oldFenBoard
        });

        Object.defineProperty(game, '_fenBoard', {
            value: newFenBoard
        });

        // When
        game.nextTurn();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.MOVE_SYNC);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    test('nextTurn should create a synchrone turn because destination was not protected', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 2] };
        const whiteMove: Move = { from: [FenColumn.E, 6], to: [FenColumn.E, 8] };

        const action: SyncTurnAction = { whiteMove, blackMove };
        const expectedAction: SyncTurnAction = {
            whiteMove: null,
            blackMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: true,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const oldFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.WHITE_QUEEN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        const newFenBoard: FenBoard = [
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK, FenPiece.WHITE_KING, FenPiece.WHITE_QUEEN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        Object.defineProperty(game, '_oldFenBoard', {
            value: oldFenBoard
        });

        Object.defineProperty(game, '_fenBoard', {
            value: newFenBoard
        });

        // When
        game.nextTurn();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.MOVE_SYNC);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    test('nextTurn should extract the turn from a choice turn', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const synchroneTurn: SyncTurn = new SyncTurn();

        const choiceTurnSpy = TestHelper.cast<ChoiceTurn>({
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            type: TurnType.CHOICE_PROMOTION,
            isDone: false,
            action: {},
            category: TurnCategory.CHOICE,
            nextTurn: synchroneTurn,
        });

        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy,
            writable: true
        });

        // When
        game.nextTurn();
        // Then
        expect(game.getTurn()).toBe(synchroneTurn);
        expect(game.getOldTurn()).toBe(choiceTurnSpy);
    });

    test('getIntermediateTurnPossiblePlays should return empty if no target', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const action: IntermediateTurnAction = {
            whiteTarget: null,
            blackTarget: null,
            whiteMove: null,
            blackMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const blackPosition: Vec2 = new Vec2(Column.C, Row._5);
        const whitePosition: Vec2 = new Vec2(Column.B, Row._4);
        const blackPossiblePlays: Array<Vec2> = [whitePosition];
        const whitePossiblePlays: Array<Vec2> = [blackPosition];

        game.load(fenBoardInit);

        // When
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(blackPossiblePlays, blackPosition);

        // Then
        expect(whiteResult).toEqual([]);
        expect(blackResult).toEqual([]);
    });

    test('getIntermediateTurnPossiblePlays should return an array of plays targeting the target', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteTarget: FenCoordinate = [FenColumn.C, 5];
        const blackTarget: FenCoordinate = [FenColumn.B, 4];
        const action: IntermediateTurnAction = {
            whiteTarget,
            blackTarget,
            whiteMove: null,
            blackMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const blackPosition: Vec2 = new Vec2(Column.C, Row._5);
        const whitePosition: Vec2 = new Vec2(Column.B, Row._4);
        const blackPossiblePlays: Array<Vec2> = [whitePosition, new Vec2(Column.B, Row._5)];
        const whitePossiblePlays: Array<Vec2> = [blackPosition, new Vec2(Column.C, Row._4)];
        const expectedBlackPossiblePlays: Array<Vec2> = [whitePosition];
        const expectedWhitePossiblePlays: Array<Vec2> = [blackPosition];

        game.load(fenBoardInit);

        // When
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(blackPossiblePlays, blackPosition);

        // Then
        expect(game.getOldTurn()).toBeNull();
        expect(whiteResult).toEqual(expectedWhitePossiblePlays);
        expect(blackResult).toEqual(expectedBlackPossiblePlays);
    });

    test('getIntermediateTurnPossiblePlays should exclude the movement of last moved pieces', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteTarget: FenCoordinate = [FenColumn.C, 5];
        const blackTarget: FenCoordinate = [FenColumn.B, 4];
        const oldAction: SyncTurnAction = {
            whiteMove: { from: [FenColumn.C, 2], to: blackTarget },
            blackMove: { from: [FenColumn.B, 7], to: whiteTarget }
        };
        const action: IntermediateTurnAction = {
            whiteTarget,
            blackTarget,
            whiteMove: null,
            blackMove: null,
        };
        const turn: IntermediateTurn = new IntermediateTurn(action, oldAction.whiteMove, oldAction.blackMove);

        Object.defineProperty(game, 'turn', {
            value: turn,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const blackPosition: Vec2 = new Vec2(Column.C, Row._5);
        const whitePosition: Vec2 = new Vec2(Column.B, Row._4);
        const blackPossiblePlays: Array<Vec2> = [whitePosition, new Vec2(Column.B, Row._5)];
        const whitePossiblePlays: Array<Vec2> = [blackPosition, new Vec2(Column.C, Row._4)];
        const expectedBlackPossiblePlays: Array<Vec2> = [];
        const expectedWhitePossiblePlays: Array<Vec2> = [];

        game.load(fenBoardInit);

        // When
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(blackPossiblePlays, blackPosition);

        // Then
        expect(whiteResult).toEqual(expectedWhitePossiblePlays);
        expect(blackResult).toEqual(expectedBlackPossiblePlays);
    });

    test('getIntermediateTurnPossiblePlays should return an array of plays targeting the target with skip turn', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteTarget: FenCoordinate = [FenColumn.C, 5];
        const blackTarget: FenCoordinate = [FenColumn.B, 4];
        const oldAction: SyncTurnAction = {
            whiteMove: null,
            blackMove: null
        };
        const action: IntermediateTurnAction = {
            whiteTarget,
            blackTarget,
            whiteMove: null,
            blackMove: null,
        };

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const oldTurnSpy = TestHelper.cast<Turn>({
            canBeExecuted: vi.fn(),
            type: TurnType.MOVE_SYNC,
            isDone: false,
            action: oldAction,
        });
        Object.defineProperty(game, 'oldTurn', {
            value: oldTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        const blackPosition: Vec2 = new Vec2(Column.C, Row._5);
        const whitePosition: Vec2 = new Vec2(Column.B, Row._4);
        const blackPossiblePlays: Array<Vec2> = [whitePosition, new Vec2(Column.B, Row._5)];
        const whitePossiblePlays: Array<Vec2> = [blackPosition, new Vec2(Column.C, Row._4)];
        const expectedBlackPossiblePlays: Array<Vec2> = [whitePosition];
        const expectedWhitePossiblePlays: Array<Vec2> = [blackPosition];

        game.load(fenBoardInit);

        // When
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(blackPossiblePlays, blackPosition);

        // Then
        expect(whiteResult).toEqual(expectedWhitePossiblePlays);
        expect(blackResult).toEqual(expectedBlackPossiblePlays);
    });

    test('canPromote should return true if a pawn can be promoted', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, FenRow._7], to: [FenColumn.A, FenRow._8] };
        const blackMove: Move = { from: [FenColumn.A, FenRow._2], to: [FenColumn.A, FenRow._1] };

        const fenBoardInit: FenBoard = [
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        const whiteCanPromote: boolean = game.canPromote(whiteMove);
        const blackCanPromote: boolean = game.canPromote(blackMove);

        // Then
        expect(whiteCanPromote).toBeTruthy();
        expect(blackCanPromote).toBeTruthy();
    });

    test('canPromote should return false if a pawn can not be promoted', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, FenRow._6], to: [FenColumn.A, FenRow._7] };
        const blackMove: Move = { from: [FenColumn.A, FenRow._3], to: [FenColumn.A, FenRow._2] };

        const fenBoardInit: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        const whiteCanPromote: boolean = game.canPromote(whiteMove);
        const blackCanPromote: boolean = game.canPromote(blackMove);
        const nullMove: boolean = game.canPromote(null);

        // Then
        expect(whiteCanPromote).toBeFalsy();
        expect(blackCanPromote).toBeFalsy();
        expect(nullMove).toBeFalsy();
    });

    test('checkPromotion should create a promotion turn for both player', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, FenRow._7], to: [FenColumn.A, FenRow._8] };
        const blackMove: Move = { from: [FenColumn.A, FenRow._2], to: [FenColumn.A, FenRow._1] };
        const action: SyncTurnAction = { whiteMove, blackMove };
        const nextTurn: SyncTurn = new SyncTurn();

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'oldTurn', {
            value: moveTurnSpy,
            writable: true
        });
        Object.defineProperty(game, 'turn', {
            value: nextTurn,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        game.checkPromotionTurn();

        // Then
        expect(game.getTurn().type).toEqual(TurnType.CHOICE_PROMOTION);
        expect((game.getTurn() as PromotionTurn).nextTurn).toBe(nextTurn);
    });

    test('checkPromotion should not create a promotion turn', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, FenRow._6], to: [FenColumn.A, FenRow._7] };
        const blackMove: Move = { from: [FenColumn.A, FenRow._3], to: [FenColumn.A, FenRow._2] };
        const action: SyncTurnAction = { whiteMove, blackMove };
        const nextTurn: SyncTurn = new SyncTurn();

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action,
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'oldTurn', {
            value: moveTurnSpy,
            writable: true
        });
        Object.defineProperty(game, 'turn', {
            value: nextTurn,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.EMPTY, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.EMPTY, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        game.checkPromotionTurn();

        // Then
        expect(game.getTurn().type).not.toEqual(TurnType.CHOICE_PROMOTION);
    });

    test('checkPromotion should not create a promotion turn if last turn was not a move turn', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const choiceTurnSpy = {
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: {},
            type: TurnType.CHOICE_PROMOTION,
            category: TurnCategory.CHOICE,
            nextTurn: {
                canBeExecuted: vi.fn(),
                isFilled: vi.fn(),
                isDone: false,
                action: {},
                type: TurnType.MOVE_SYNC,
                category: TurnCategory.MOVE,
            } as Turn,
        } as ChoiceTurn;
        Object.defineProperty(game, 'oldTurn', {
            value: choiceTurnSpy
        });
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });

        // When
        game.checkPromotionTurn();

        // Then
        expect(game.getTurn().type).not.toEqual(TurnType.CHOICE_PROMOTION);
    });

    test('runPromotionTurn should promote a piece into a new board', () => {
        // Given

        const game: ProtectedTest = new ProtectedTest();

        const action: PromotionTurnAction = {
            whiteFenCoordinate: [FenColumn.A, FenRow._8],
            blackFenCoordinate: [FenColumn.A, FenRow._1],
            whitePiece: PieceType.QUEEN,
            blackPiece: PieceType.QUEEN
        };

        const choiceTurnSpy = TestHelper.cast<ChoiceTurn>({
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            type: TurnType.CHOICE_PROMOTION,
            isDone: false,
            action,
            category: TurnCategory.CHOICE,
        });
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy
        });

        const initialFenBoard: FenBoard = [
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(initialFenBoard);

        const expectedFenBoard: FenBoard = [
            [FenPiece.WHITE_QUEEN, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_QUEEN, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When

        game.runPromotionTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('runPromotionTurn should skip the promotion', () => {
        // Given

        const game: ProtectedTest = new ProtectedTest();

        const action: PromotionTurnAction = {
            whiteFenCoordinate: null,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null
        };

        const choiceTurnSpy = TestHelper.cast<ChoiceTurn>({
            registerChoice: vi.fn(),
            canBeExecuted: vi.fn(),
            type: TurnType.CHOICE_PROMOTION,
            isDone: false,
            action,
            category: TurnCategory.CHOICE,
        });
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy
        });

        const initialFenBoard: FenBoard = [
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(initialFenBoard);

        const expectedFenBoard: FenBoard = [
            [FenPiece.WHITE_PAWN, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.BLACK_PAWN, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        // When

        game.runPromotionTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    test('verifyCheck should detect both check state', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_QUEEN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        game.verifyCheck();
        // Then
        expect(game.isBlackInCheck).toBeTruthy();
        expect(game.isWhiteInCheck).toBeTruthy();
        expect(game.isBlackInCheckmate).toBeFalsy();
        expect(game.isWhiteInCheckmate).toBeFalsy();
    });

    test('verifyCheck should detect both checkmate state', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_QUEEN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        game.verifyCheck();
        // Then
        expect(game.isBlackInCheck).toBeTruthy();
        expect(game.isWhiteInCheck).toBeTruthy();
        expect(game.isBlackInCheckmate).toBeTruthy();
        expect(game.isWhiteInCheckmate).toBeTruthy();
    });

    test('verifyCheck should not detect check state', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_QUEEN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        game.verifyCheck();
        // Then
        expect(game.isBlackInCheck).toBeFalsy();
        expect(game.isWhiteInCheck).toBeFalsy();
        expect(game.isBlackInCheckmate).toBeFalsy();
        expect(game.isWhiteInCheckmate).toBeFalsy();
    });

    test('verifyCheck should return on turn other than synchrone turn', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: TurnType.MOVE_INTERMEDIATE,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_QUEEN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        game.verifyCheck();
        // Then
        expect(game.isBlackInCheck).toBeFalsy();
        expect(game.isWhiteInCheck).toBeFalsy();
        expect(game.isBlackInCheckmate).toBeFalsy();
        expect(game.isWhiteInCheckmate).toBeFalsy();
    });

    test('getPossiblePlays should only return king plays during check state', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: TurnType.MOVE_SYNC,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });
        const whitePawn: Vec2 = new Vec2(Column.B, Row._2);
        const whiteKing: Vec2 = new Vec2(Column.E, Row._1);
        const blackPawn: Vec2 = new Vec2(Column.B, Row._7);
        const blackKing: Vec2 = new Vec2(Column.E, Row._8);

        const whitePawnExpectedPlays: Array<Vec2> = [];
        const whiteKingExpectedPlays: Array<Vec2> = [new Vec2(Column.F, Row._2)];
        const blackPawnExpectedPlays: Array<Vec2> = [];
        const blackKingExpectedPlays: Array<Vec2> = [new Vec2(Column.D, Row._7)];
        game.isBlackInCheck = true;
        game.isWhiteInCheck = true;

        const fenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_QUEEN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(fenBoardInit);

        // When
        const whitePawnPlays: Array<Vec2> = game.getPossiblePlays(whitePawn);
        const whiteKingPlays: Array<Vec2> = game.getPossiblePlays(whiteKing);
        const blackPawnPlays: Array<Vec2> = game.getPossiblePlays(blackPawn);
        const blackKingPlays: Array<Vec2> = game.getPossiblePlays(blackKing);

        // Then
        expect(whitePawnPlays).toEqual(whitePawnExpectedPlays);
        expect(whiteKingPlays).toEqual(whiteKingExpectedPlays);
        expect(blackPawnPlays).toEqual(blackPawnExpectedPlays);
        expect(blackKingPlays).toEqual(blackKingExpectedPlays);
    });

    test('getPossiblePlays should return plays without treatment if move type is unknown ', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const moveTurnSpy = {
            registerMove: vi.fn(),
            canBeExecuted: vi.fn(),
            isFilled: vi.fn(),
            isDone: false,
            action: { whiteMove: null, blackMove: null },
            type: '' as TurnType,
            category: TurnCategory.MOVE,
        } as MoveTurn;
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });
        const whitePawnExpectedPlays: Array<Vec2> = [new Vec2(Column.B, Row._3), new Vec2(Column.B, Row._4)];
        const blackPawnExpectedPlays: Array<Vec2> = [new Vec2(Column.B, Row._6), new Vec2(Column.B, Row._5)];
        const whitePawn: Vec2 = new Vec2(Column.B, Row._2);
        const blackPawn: Vec2 = new Vec2(Column.B, Row._7);

        // When
        const whitePawnPlays: Array<Vec2> = game.getPossiblePlays(whitePawn);
        const blackPawnPlays: Array<Vec2> = game.getPossiblePlays(blackPawn);

        // Then
        expect(whitePawnPlays).toEqual(whitePawnExpectedPlays);
        expect(blackPawnPlays).toEqual(blackPawnExpectedPlays);
    });
});
