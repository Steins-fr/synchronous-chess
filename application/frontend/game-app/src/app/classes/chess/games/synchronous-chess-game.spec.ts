import SynchronousChessGame from './synchronous-chess-game';
import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from '../../../helpers/chess-board-helper';
import ChessRules, { FenPiece, PieceColor, PieceType } from '../rules/chess-rules';
import { Column, Row } from '../interfaces/CoordinateMove';
import Move, { FenColumn, FenCoordinate, FenRow } from '../interfaces/move';
import Turn from '../turns/turn';
import TurnType, { TurnCategory } from '../turns/turn.types';
import SynchroneTurnAction from '../turns/turn-actions/synchrone-turn-action';
import IntermediateTurnAction from '../turns/turn-actions/intermediate-turn-action';
import { IntermediateTurn } from '../turns/intermediate-turn';
import MoveTurn from '../turns/move-turn';
import ChoiceTurn from '../turns/choice-turn';
import MoveTurnAction from '../turns/turn-actions/move-turn-action';
import SynchroneTurn from '../turns/synchrone-turn';
import PromotionTurn from '../turns/promotion-turn';
import PromotionTurnAction from '../turns/turn-actions/promotion-turn-action';
import SynchronousChessRules from '../rules/synchronous-chess-rules';

class ProtectedTest extends SynchronousChessGame {
    public runSynchroneTurn(): void {
        super.runSynchroneTurn();
    }

    public runIntermediateTurn(): void {
        super.runIntermediateTurn();
    }

    public nextTurn(): void {
        super.nextTurn();
    }

    public getRules(color: PieceColor): SynchronousChessRules {
        return super.getRules(color);
    }

    public isTurnValid(): boolean {
        return super.isTurnValid();
    }

    public getIntermediateTurnPossiblePlays(possiblePlays: Array<Vec2>, position: Vec2): Array<Vec2> {
        return super.getIntermediateTurnPossiblePlays(possiblePlays, position);
    }

    public canPromote(move: Move): boolean {
        return super.canPromote(move);
    }

    public checkPromotionTurn(): void {
        super.checkPromotionTurn();
    }

    public runPromotionTurn(): void {
        super.runPromotionTurn();
    }

    public verifyCheck(): void {
        super.verifyCheck();
    }

    public getTurn(): Turn {
        return this.turn;
    }

    public getOldTurn(): Turn {
        return this.oldTurn;
    }
}

describe('SynchronousChessGame', () => {

    let moveTurnSpy: jasmine.SpyObj<MoveTurn>;
    let choiceTurnSpy: jasmine.SpyObj<ChoiceTurn>;
    let oldTurnSpy: jasmine.SpyObj<Turn>;

    beforeEach(() => {
        moveTurnSpy = jasmine.createSpyObj<MoveTurn>('Turn', ['registerMove', 'canBeExecuted', 'type', 'isDone', 'action']);
        Object.defineProperty(moveTurnSpy, 'action', {
            value: {},
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'category', {
            value: TurnCategory.MOVE,
            writable: false
        });
        choiceTurnSpy = jasmine.createSpyObj<ChoiceTurn>('Turn', ['registerChoice', 'canBeExecuted', 'type', 'isDone', 'action']);
        Object.defineProperty(choiceTurnSpy, 'action', {
            value: {},
            writable: false
        });
        Object.defineProperty(choiceTurnSpy, 'category', {
            value: TurnCategory.CHOICE,
            writable: false
        });
        oldTurnSpy = jasmine.createSpyObj<Turn>('Turn', ['canBeExecuted', 'type', 'isDone', 'action']);
        Object.defineProperty(oldTurnSpy, 'action', {
            value: {},
            writable: false
        });
    });

    it('should create an instance', () => {
        expect(new SynchronousChessGame()).toBeTruthy();
    });

    it('should get the rules for a specific color', () => {
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

    it('should get the last turn action of move category', () => {
        // Given
        const gameUndefinedOldTurn: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(gameUndefinedOldTurn, 'oldTurn', {
            value: undefined,
        });
        const gameMoveTurn: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(gameMoveTurn, 'oldTurn', {
            value: moveTurnSpy,
        });
        const gameChoiceTurn: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(gameChoiceTurn, 'oldTurn', {
            value: choiceTurnSpy,
        });

        // When
        const actionUndefinedOldTurn: MoveTurnAction | null = gameUndefinedOldTurn.lastMoveTurnAction();
        const actionMoveTurn: MoveTurnAction | null = gameMoveTurn.lastMoveTurnAction();
        const actionChoiceTurn: MoveTurnAction | null = gameChoiceTurn.lastMoveTurnAction();

        // Then
        expect(actionUndefinedOldTurn).toEqual(null);
        expect(actionMoveTurn).toBe(moveTurnSpy.action);
        expect(actionChoiceTurn).toEqual(null);
    });

    it('getPossiblePlays should return the piece possible plays', () => {
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

    it('getPossiblePlays should return empty during choice turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
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

    it('should register move if it is valid', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const isMoveValidSpy: jasmine.Spy = jasmine.createSpy('isMoveValid');
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: false
        });
        game.isMoveValid = isMoveValidSpy;
        isMoveValidSpy.and.returnValue(true);
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 5] };
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.registerMove(move, color);

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.registerMove.calls.count()).toEqual(1);
        expect(isMoveValidSpy.calls.count()).toEqual(1);
    });

    it('should not register move if it is invalid', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const isMoveValidSpy: jasmine.Spy = jasmine.createSpy('isMoveValid');
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: false
        });
        game.isMoveValid = isMoveValidSpy;
        isMoveValidSpy.and.returnValue(false);
        const move: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 5] };
        const color: PieceColor = PieceColor.BLACK;

        // When
        const result: boolean = game.registerMove(move, color);

        // Then
        expect(result).toEqual(false);
        expect(moveTurnSpy.registerMove.calls.count()).toEqual(0);
        expect(isMoveValidSpy.calls.count()).toEqual(1);
    });

    it('registerMove should not skip move if in check', () => {
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

    it('should not register move if this is not a move turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
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

    it('should not promote if this is not a promotion turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
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

    it('should promote if this is a promotion turn', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(choiceTurnSpy, 'type', {
            value: TurnType.CHOICE_PROMOTION
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
        expect(choiceTurnSpy.registerChoice.calls.count()).toEqual(1);
    });

    it('isMoveValid should return false if origin is empty', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
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

    it('isTurnValid should return false if the turn type is unknown', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const runSynchroneTurnSpy: jasmine.Spy = jasmine.createSpy('runSynchroneTurn');
        Object.defineProperty(game, 'runSynchroneTurn', {
            value: runSynchroneTurnSpy,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: 'unknownType',
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });

        // When
        const result: boolean = game.isTurnValid();

        // Then
        expect(result).toEqual(false);
    });

    it('should not execute the turn if not ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        moveTurnSpy.canBeExecuted.and.returnValue(false);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(false);
        expect(moveTurnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(moveTurnSpy.isDone).toEqual(false);
    });

    it('should execute runSynchroneTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runSynchroneTurnSpy: jasmine.Spy = jasmine.createSpy('runSynchroneTurn');
        const nextTurnSpy: jasmine.Spy = jasmine.createSpy('nextTurn');
        const checkPromotionTurnSpy: jasmine.Spy = jasmine.createSpy('checkPromotionTurn');
        const verifyCheckSpy: jasmine.Spy = jasmine.createSpy('verifyCheck');
        Object.defineProperty(game, 'nextTurn', {
            value: nextTurnSpy
        });
        Object.defineProperty(game, 'verifyCheck', {
            value: verifyCheckSpy
        });
        Object.defineProperty(game, 'checkPromotionTurn', {
            value: checkPromotionTurnSpy
        });
        Object.defineProperty(game, 'runSynchroneTurn', {
            value: runSynchroneTurnSpy
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });
        moveTurnSpy.canBeExecuted.and.returnValue(true);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runSynchroneTurnSpy.calls.count()).toEqual(1);
        expect(moveTurnSpy.isDone).toEqual(true);
    });

    it('should execute runIntermediateTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runIntermediateTurnSpy: jasmine.Spy = jasmine.createSpy('runIntermediateTurn');
        const nextTurnSpy: jasmine.Spy = jasmine.createSpy('nextTurn');
        const checkPromotionTurnSpy: jasmine.Spy = jasmine.createSpy('checkPromotionTurn');
        const verifyCheckSpy: jasmine.Spy = jasmine.createSpy('verifyCheck');
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
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_INTERMEDIATE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        moveTurnSpy.canBeExecuted.and.returnValue(true);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runIntermediateTurnSpy.calls.count()).toEqual(1);
        expect(moveTurnSpy.isDone).toEqual(true);
    });

    it('should execute PromotionTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runPromotionTurnSpy: jasmine.Spy = jasmine.createSpy('runPromotionTurn');
        const nextTurnSpy: jasmine.Spy = jasmine.createSpy('nextTurn');
        const checkPromotionTurnSpy: jasmine.Spy = jasmine.createSpy('checkPromotionTurn');
        const verifyCheckSpy: jasmine.Spy = jasmine.createSpy('verifyCheck');
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
        Object.defineProperty(choiceTurnSpy, 'type', {
            value: TurnType.CHOICE_PROMOTION,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: choiceTurnSpy,
            writable: true
        });
        choiceTurnSpy.canBeExecuted.and.returnValue(true);
        choiceTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(choiceTurnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runPromotionTurnSpy.calls.count()).toEqual(1);
        expect(choiceTurnSpy.isDone).toEqual(true);
    });

    it('should change turn if executed', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const runMoveSpy: jasmine.Spy = jasmine.createSpy('runMove');
        const checkPromotionTurnSpy: jasmine.Spy = jasmine.createSpy('checkPromotionTurn');
        const verifyCheckSpy: jasmine.Spy = jasmine.createSpy('verifyCheck');
        Object.defineProperty(game, 'verifyCheck', {
            value: verifyCheckSpy
        });
        Object.defineProperty(game, 'checkPromotionTurn', {
            value: checkPromotionTurnSpy
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: '',
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
        });
        Object.defineProperty(game, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        moveTurnSpy.canBeExecuted.and.returnValue(true);
        moveTurnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(moveTurnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runMoveSpy.calls.count()).toEqual(0);
        expect(moveTurnSpy.isDone).toEqual(true);
        expect(game.getTurn()).not.toBe(moveTurnSpy);
    });

    it('runSynchroneTurn should not apply a bad play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const move1: Move = { from: [FenColumn.B, 8], to: [FenColumn.D, 7] };
        const move2: Move = { from: [FenColumn.D, 5], to: [FenColumn.D, 7] };

        const action: SynchroneTurnAction = { whiteMove: move1, blackMove: move2 };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();

        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should apply a valid play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.C, 6] };
        const whiteMove: Move = { from: [FenColumn.B, 1], to: [FenColumn.C, 3] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should pass move', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const action: SynchroneTurnAction = { whiteMove: null, blackMove: null };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should double capture', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 4] };
        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should double capture with black king surviving', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 5], to: [FenColumn.A, 4] };
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should double capture with white king surviving', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 5], to: [FenColumn.A, 4] };
        const whiteMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should exchange places', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 1] };
        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 8] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should move only the white piece', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 8] };

        const action: SynchroneTurnAction = { whiteMove, blackMove: null };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should move only the black piece', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 1] };

        const action: SynchroneTurnAction = { whiteMove: null, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        game.runSynchroneTurn();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runIntermediateTurn should not apply a bad play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.D, 7] };
        const blackMove: Move = { from: [FenColumn.D, 5], to: [FenColumn.D, 7] };

        const action: IntermediateTurnAction = { whiteMove, blackMove, whiteTarget: whiteMove.from, blackTarget: blackMove.from };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_INTERMEDIATE,
            writable: false
        });
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

    it('runIntermediateTurn should apply a valid play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.C, 6] };
        const whiteMove: Move = { from: [FenColumn.B, 1], to: [FenColumn.C, 3] };

        const action: IntermediateTurnAction = { whiteMove, blackMove, whiteTarget: whiteMove.to, blackTarget: blackMove.to };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_INTERMEDIATE,
            writable: false
        });
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

    it('runIntermediateTurn should pass moves', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.B, 8], to: [FenColumn.C, 6] };
        const whiteMove: Move = { from: [FenColumn.B, 1], to: [FenColumn.C, 3] };

        const action: IntermediateTurnAction = { whiteMove: null, blackMove: null, whiteTarget: whiteMove.to, blackTarget: blackMove.to };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_INTERMEDIATE,
            writable: false
        });
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

    it('should apply king single move', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.E, 8], to: [FenColumn.E, 7] };
        const whiteMove: Move = { from: [FenColumn.E, 1], to: [FenColumn.E, 2] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable;
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable;

        // When
        game.runSynchroneTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable).toBeFalsy();
        expect(game.blackRules.isQueenSideCastleAvailable).toBeFalsy();
    });

    it('should apply king castling', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.E, 8], to: [FenColumn.G, 8] };
        const whiteMove: Move = { from: [FenColumn.A, 2], to: [FenColumn.A, 3] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable;
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable;

        // When
        game.runSynchroneTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable).toBeFalsy();
        expect(game.blackRules.isQueenSideCastleAvailable).toBeFalsy();
    });

    it('should disable king side castling', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.H, 8], to: [FenColumn.H, 7] };
        const whiteMove: Move = { from: [FenColumn.A, 2], to: [FenColumn.A, 3] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable;
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable;

        // When
        game.runSynchroneTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable).toBeFalsy();
        expect(game.blackRules.isQueenSideCastleAvailable).toBeTruthy();
    });

    it('should disable queen side castling', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 7] };
        const whiteMove: Move = { from: [FenColumn.A, 2], to: [FenColumn.A, 3] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

        const castlingQueen: boolean = game.blackRules.isQueenSideCastleAvailable;
        const castlingKing: boolean = game.blackRules.isKingSideCastleAvailable;

        // When
        game.runSynchroneTurn();

        // Then
        expect(game.fenBoard).toEqual(expectedFenBoard);
        expect(castlingKing).toBeTruthy();
        expect(castlingQueen).toBeTruthy();
        expect(game.blackRules.isKingSideCastleAvailable).toBeTruthy();
        expect(game.blackRules.isQueenSideCastleAvailable).toBeFalsy();
    });

    it('nextTurn should create an intermediate turn', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };
        const whiteMove: Move = { from: [FenColumn.F, 2], to: [FenColumn.F, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };
        const expectedAction: IntermediateTurnAction = { whiteTarget: blackMove.to, blackTarget: whiteMove.to };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

    it('nextTurn should create an intermediate turn for the white', () => {
        // Given
        ChessBoardHelper.disableCache();

        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };

        const action: SynchroneTurnAction = { whiteMove: null, blackMove };
        const expectedAction: IntermediateTurnAction = { whiteTarget: blackMove.to, blackTarget: null, blackMove: null };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

    it('nextTurn should create an intermediate turn for the black', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.F, 2], to: [FenColumn.F, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove: null };
        const expectedAction: IntermediateTurnAction = { whiteTarget: null, blackTarget: whiteMove.to, whiteMove: null };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        expect(game.getTurn().type).toEqual(TurnType.MOVE_INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    it('nextTurn should create a synchrone turn because both has moved', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };
        const whiteMove: Move = { from: [FenColumn.B, 2], to: [FenColumn.B, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };
        const expectedAction: SynchroneTurnAction = {};

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        expect(game.getTurn().type).toEqual(TurnType.MOVE_SYNCHRONE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    it('nextTurn should create a synchrone turn because destination was not protected', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 3], to: [FenColumn.A, 2] };
        const whiteMove: Move = { from: [FenColumn.E, 6], to: [FenColumn.E, 8] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };
        const expectedAction: SynchroneTurnAction = {};

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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
        expect(game.getTurn().type).toEqual(TurnType.MOVE_SYNCHRONE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(moveTurnSpy);
    });

    it('nextTurn should extract the turn from a choice turn', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const synchroneTurn: SynchroneTurn = new SynchroneTurn();

        Object.defineProperty(choiceTurnSpy, 'type', {
            value: TurnType.CHOICE_PROMOTION,
            writable: false
        });
        Object.defineProperty(choiceTurnSpy, 'nextTurn', {
            value: synchroneTurn,
            writable: false
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

    it('getIntermediateTurnPossiblePlays should return empty if no target', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const action: IntermediateTurnAction = { whiteTarget: null, blackTarget: null };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
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

        const blackPosition: Vec2 = new Vec2([Column.C, Row._5]);
        const whitePosition: Vec2 = new Vec2([Column.B, Row._4]);
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

    it('getIntermediateTurnPossiblePlays should return an array of plays targeting the target', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteTarget: FenCoordinate = [FenColumn.C, 5];
        const blackTarget: FenCoordinate = [FenColumn.B, 4];
        const action: IntermediateTurnAction = { whiteTarget, blackTarget };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
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

        const blackPosition: Vec2 = new Vec2([Column.C, Row._5]);
        const whitePosition: Vec2 = new Vec2([Column.B, Row._4]);
        const blackPossiblePlays: Array<Vec2> = [whitePosition, new Vec2([Column.B, Row._5])];
        const whitePossiblePlays: Array<Vec2> = [blackPosition, new Vec2([Column.C, Row._4])];
        const expectedBlackPossiblePlays: Array<Vec2> = [whitePosition];
        const expectedWhitePossiblePlays: Array<Vec2> = [blackPosition];

        game.load(fenBoardInit);

        // When
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlays(blackPossiblePlays, blackPosition);

        // Then
        expect(game.getOldTurn()).toEqual(undefined);
        expect(whiteResult).toEqual(expectedWhitePossiblePlays);
        expect(blackResult).toEqual(expectedBlackPossiblePlays);
    });

    it('getIntermediateTurnPossiblePlays should exclude the movement of last moved pieces', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteTarget: FenCoordinate = [FenColumn.C, 5];
        const blackTarget: FenCoordinate = [FenColumn.B, 4];
        const oldAction: SynchroneTurnAction = {
            whiteMove: { from: [FenColumn.C, 2], to: blackTarget },
            blackMove: { from: [FenColumn.B, 7], to: whiteTarget }
        };
        const action: IntermediateTurnAction = { whiteTarget, blackTarget };
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

        const blackPosition: Vec2 = new Vec2([Column.C, Row._5]);
        const whitePosition: Vec2 = new Vec2([Column.B, Row._4]);
        const blackPossiblePlays: Array<Vec2> = [whitePosition, new Vec2([Column.B, Row._5])];
        const whitePossiblePlays: Array<Vec2> = [blackPosition, new Vec2([Column.C, Row._4])];
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

    it('getIntermediateTurnPossiblePlays should return an array of plays targeting the target with skip turn', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteTarget: FenCoordinate = [FenColumn.C, 5];
        const blackTarget: FenCoordinate = [FenColumn.B, 4];
        const oldAction: SynchroneTurnAction = {
            whiteMove: null,
            blackMove: null
        };
        const action: IntermediateTurnAction = { whiteTarget, blackTarget };

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(oldTurnSpy, 'action', {
            value: oldAction,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy,
            writable: true
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

        const blackPosition: Vec2 = new Vec2([Column.C, Row._5]);
        const whitePosition: Vec2 = new Vec2([Column.B, Row._4]);
        const blackPossiblePlays: Array<Vec2> = [whitePosition, new Vec2([Column.B, Row._5])];
        const whitePossiblePlays: Array<Vec2> = [blackPosition, new Vec2([Column.C, Row._4])];
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

    it('canPromote should return true if a pawn can be promoted', () => {
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

    it('canPromote should return false if a pawn can not be promoted', () => {
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

    it('checkPromotion should create a promotion turn for both player', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, FenRow._7], to: [FenColumn.A, FenRow._8] };
        const blackMove: Move = { from: [FenColumn.A, FenRow._2], to: [FenColumn.A, FenRow._1] };
        const action: SynchroneTurnAction = { whiteMove, blackMove };
        const nextTurn: SynchroneTurn = new SynchroneTurn();

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
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

    it('checkPromotion should not create a promotion turn', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, FenRow._6], to: [FenColumn.A, FenRow._7] };
        const blackMove: Move = { from: [FenColumn.A, FenRow._3], to: [FenColumn.A, FenRow._2] };
        const action: SynchroneTurnAction = { whiteMove, blackMove };
        const nextTurn: SynchroneTurn = new SynchroneTurn();

        Object.defineProperty(moveTurnSpy, 'action', {
            value: action,
            writable: false
        });
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

    it('checkPromotion should not create a promotion turn if last turn was not a move turn', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        Object.defineProperty(game, 'oldTurn', {
            value: choiceTurnSpy
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });

        // When
        game.checkPromotionTurn();

        // Then
        expect(game.getTurn().type).not.toEqual(TurnType.CHOICE_PROMOTION);
    });

    it('runPromotionTurn should promote a piece into a new board', () => {
        // Given

        const game: ProtectedTest = new ProtectedTest();

        const action: PromotionTurnAction = {
            whiteFenCoordinate: [FenColumn.A, FenRow._8],
            blackFenCoordinate: [FenColumn.A, FenRow._1],
            whitePiece: PieceType.QUEEN,
            blackPiece: PieceType.QUEEN
        };

        Object.defineProperty(choiceTurnSpy, 'action', {
            value: action,
            writable: false
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

    it('runPromotionTurn should skip the promotion', () => {
        // Given

        const game: ProtectedTest = new ProtectedTest();

        const action: PromotionTurnAction = {
            whiteFenCoordinate: null,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null
        };

        Object.defineProperty(choiceTurnSpy, 'action', {
            value: action,
            writable: false
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

    it('verifyCheck should detect both check state', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

    it('verifyCheck should detect both checkmate state', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

    it('verifyCheck should not detect check state', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
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

    it('verifyCheck should return on turn other than synchrone turn', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_INTERMEDIATE,
            writable: false
        });
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

    it('getPossiblePlays should only return king plays during check state', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(moveTurnSpy, 'type', {
            value: TurnType.MOVE_SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });
        const whitePawn: Vec2 = new Vec2(Column.B, Row._2);
        const whiteKing: Vec2 = new Vec2(Column.E, Row._1);
        const blackPawn: Vec2 = new Vec2(Column.B, Row._7);
        const blackKing: Vec2 = new Vec2(Column.E, Row._8);

        const whitePawnExpectedPlays: Array<Vec2> = [];
        const whiteKingExpectedPlays: Array<Vec2> = [new Vec2([Column.F, Row._2])];
        const blackPawnExpectedPlays: Array<Vec2> = [];
        const blackKingExpectedPlays: Array<Vec2> = [new Vec2([Column.D, Row._7])];
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

    it('getPossiblePlays should return plays without treatment if move type is unknown ', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(moveTurnSpy, 'type', {
            value: '',
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: moveTurnSpy
        });
        const whitePawnExpectedPlays: Array<Vec2> = [new Vec2([Column.B, Row._3]), new Vec2([Column.B, Row._4])];
        const blackPawnExpectedPlays: Array<Vec2> = [new Vec2([Column.B, Row._6]), new Vec2([Column.B, Row._5])];
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
