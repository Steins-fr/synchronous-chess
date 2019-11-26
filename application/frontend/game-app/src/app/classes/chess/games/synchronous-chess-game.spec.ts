import SynchronousChessGame from './synchronous-chess-game';
import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from '../../../helpers/chess-board-helper';
import ChessRules, { FenPiece, PieceColor } from '../rules/chess-rules';
import { Column, Row } from '../interfaces/CoordinateMove';
import Move, { FenColumn, FenCoordinate } from '../interfaces/move';
import Turn from '../turns/turn';
import TurnType from '../turns/turn.types';
import SynchroneTurnAction from '../turns/turn-actions/synchrone-turn-action';
import IntermediateTurnAction from '../turns/turn-actions/intermediate-turn-action';
import { IntermediateTurn } from '../turns/intermediate-turn';

class ProtectedTest extends SynchronousChessGame {
    public runSynchroneTurnTest(): void {
        this.runSynchroneTurn();
    }

    public runIntermediateTurnTest(): void {
        this.runIntermediateTurn();
    }

    public nextTurnTest(): void {
        this.nextTurn();
    }

    public getRulesTest(color: PieceColor): ChessRules {
        return this.getRules(color);
    }

    public isTurnValidTest(): boolean {
        return this.isTurnValid();
    }

    public getIntermediateTurnPossiblePlaysTest(possiblePlays: Array<Vec2>, position: Vec2): Array<Vec2> {
        return this.getIntermediateTurnPossiblePlays(possiblePlays, position);
    }

    public getTurn(): Turn {
        return this.turn;
    }

    public getOldTurn(): Turn {
        return this.oldTurn;
    }
}

describe('SynchronousChessGame', () => {

    let turnSpy: jasmine.SpyObj<Turn>;
    let oldTurnSpy: jasmine.SpyObj<Turn>;

    beforeEach(() => {
        turnSpy = jasmine.createSpyObj<Turn>('Turn', ['registerMove', 'canBeExecuted', 'type', 'isDone', 'action']);
        Object.defineProperty(turnSpy, 'action', {
            value: {},
            writable: false
        });
        oldTurnSpy = jasmine.createSpyObj<Turn>('Turn', ['registerMove', 'canBeExecuted', 'type', 'isDone', 'action']);
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
        const whiteRules: ChessRules = game.getRulesTest(white);
        const blackRules: ChessRules = game.getRulesTest(black);

        // Then
        expect(whiteRules).toBe(game.whiteRules);
        expect(blackRules).toBe(game.blackRules);
    });

    it('should get pieces possible plays', () => {
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


    it('should register move if it is valid', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const isMoveValidSpy: jasmine.Spy = jasmine.createSpy('isMoveValid');
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        expect(turnSpy.registerMove.calls.count()).toEqual(1);
        expect(isMoveValidSpy.calls.count()).toEqual(1);
    });

    it('should not register move if it is invalid', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const isMoveValidSpy: jasmine.Spy = jasmine.createSpy('isMoveValid');
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        expect(turnSpy.registerMove.calls.count()).toEqual(0);
        expect(isMoveValidSpy.calls.count()).toEqual(1);
    });

    it('isMoveValid should return false if origin is empty', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        Object.defineProperty(turnSpy, 'type', {
            value: 'unknownType',
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
            writable: true
        });

        // When
        const result: boolean = game.isTurnValidTest();

        // Then
        expect(result).toEqual(false);
    });

    it('should not execute the turn if not ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runMoveSpy: jasmine.Spy = jasmine.createSpy('runMove');
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
            writable: true
        });
        turnSpy.canBeExecuted.and.returnValue(false);
        turnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(false);
        expect(turnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(turnSpy.isDone).toEqual(false);
    });

    it('should execute runSynchroneTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runSynchroneTurnSpy: jasmine.Spy = jasmine.createSpy('runSynchroneTurn');
        Object.defineProperty(game, 'runSynchroneTurn', {
            value: runSynchroneTurnSpy,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
            writable: true
        });
        turnSpy.canBeExecuted.and.returnValue(true);
        turnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(turnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runSynchroneTurnSpy.calls.count()).toEqual(1);
        expect(turnSpy.isDone).toEqual(true);
    });

    it('should execute runIntermediateTurn if ready', () => {
        // Given
        const game: SynchronousChessGame = new SynchronousChessGame();
        const runIntermediateTurnSpy: jasmine.Spy = jasmine.createSpy('runIntermediateTurn');
        Object.defineProperty(game, 'runIntermediateTurn', {
            value: runIntermediateTurnSpy,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.INTERMEDIATE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
            writable: true
        });
        turnSpy.canBeExecuted.and.returnValue(true);
        turnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(turnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runIntermediateTurnSpy.calls.count()).toEqual(1);
        expect(turnSpy.isDone).toEqual(true);
    });

    it('should change turn if executed', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();
        const runMoveSpy: jasmine.Spy = jasmine.createSpy('runMove');
        Object.defineProperty(turnSpy, 'type', {
            value: '',
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
            writable: true
        });
        Object.defineProperty(game, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        turnSpy.canBeExecuted.and.returnValue(true);
        turnSpy.isDone = false;

        // When
        const result: boolean = game.runTurn();

        // Then
        expect(result).toEqual(true);
        expect(turnSpy.canBeExecuted.calls.count()).toEqual(1);
        expect(runMoveSpy.calls.count()).toEqual(0);
        expect(turnSpy.isDone).toEqual(true);
        expect(game.getTurn()).not.toBe(turnSpy);
    });

    it('runSynchroneTurn should not apply a bad play', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const move1: Move = { from: [FenColumn.B, 8], to: [FenColumn.D, 7] };
        const move2: Move = { from: [FenColumn.D, 5], to: [FenColumn.D, 7] };

        const action: SynchroneTurnAction = { whiteMove: move1, blackMove: move2 };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should pass move', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const action: SynchroneTurnAction = { whiteMove: null, blackMove: null };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy
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
        game.runSynchroneTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy
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
        game.runSynchroneTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should move only the white piece', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.A, 1], to: [FenColumn.A, 8] };

        const action: SynchroneTurnAction = { whiteMove, blackMove: null };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();
        // Then
        expect(initBoard).toEqual(expectedFenBoardInit);
        expect(game.fenBoard).toEqual(expectedFenBoard);
    });

    it('runSynchroneTurn should move only the black piece', () => {
        // Given
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.A, 8], to: [FenColumn.A, 1] };

        const action: SynchroneTurnAction = { whiteMove: null, blackMove };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.INTERMEDIATE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runIntermediateTurnTest();

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.INTERMEDIATE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runIntermediateTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.INTERMEDIATE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runIntermediateTurnTest();
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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        game.runSynchroneTurnTest();

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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

        game.load(fenBoardInit);

        // When
        game.nextTurnTest();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(turnSpy);
    });

    it('nextTurn should create an intermediate turn for the white', () => {
        // Given
        ChessBoardHelper.disableCache();

        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };

        const action: SynchroneTurnAction = { whiteMove: null, blackMove };
        const expectedAction: IntermediateTurnAction = { whiteTarget: blackMove.to, blackTarget: null, blackMove: null };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
            writable: true
        });

        const expectedFenBoardInit: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_BISHOP, FenPiece.BLACK_QUEEN, FenPiece.BLACK_KING, FenPiece.BLACK_BISHOP, FenPiece.BLACK_KNIGHT, FenPiece.BLACK_ROOK],
            [FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.BLACK_PAWN],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_PAWN, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN, FenPiece.EMPTY, FenPiece.WHITE_PAWN, FenPiece.WHITE_PAWN],
            [FenPiece.WHITE_ROOK, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_BISHOP, FenPiece.WHITE_QUEEN, FenPiece.WHITE_KING, FenPiece.WHITE_BISHOP, FenPiece.WHITE_KNIGHT, FenPiece.WHITE_ROOK]
        ];

        game.load(expectedFenBoardInit);

        // When
        game.nextTurnTest();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(turnSpy);
    });

    it('nextTurn should create an intermediate turn for the black', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const whiteMove: Move = { from: [FenColumn.F, 2], to: [FenColumn.F, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove: null };
        const expectedAction: IntermediateTurnAction = { whiteTarget: null, blackTarget: whiteMove.to, whiteMove: null };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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

        game.load(fenBoardInit);

        // When
        game.nextTurnTest();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.INTERMEDIATE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(turnSpy);
    });

    it('nextTurn should create a synchrone turn because both has moved', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const blackMove: Move = { from: [FenColumn.C, 7], to: [FenColumn.C, 5] };
        const whiteMove: Move = { from: [FenColumn.B, 2], to: [FenColumn.B, 4] };

        const action: SynchroneTurnAction = { whiteMove, blackMove };
        const expectedAction: SynchroneTurnAction = {};

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(turnSpy, 'type', {
            value: TurnType.SYNCHRONE,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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

        game.load(fenBoardInit);

        // When
        game.nextTurnTest();
        // Then
        expect(game.getTurn().type).toEqual(TurnType.SYNCHRONE);
        expect(game.getTurn().action).toEqual(expectedAction);
        expect(game.getOldTurn()).toBe(turnSpy);
    });

    it('getIntermediateTurnPossiblePlays should return empty if no target', () => {
        // Given
        ChessBoardHelper.disableCache();
        const game: ProtectedTest = new ProtectedTest();

        const action: IntermediateTurnAction = { whiteTarget: null, blackTarget: null };

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(blackPossiblePlays, blackPosition);

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(blackPossiblePlays, blackPosition);

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
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(blackPossiblePlays, blackPosition);

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

        Object.defineProperty(turnSpy, 'action', {
            value: action,
            writable: false
        });
        Object.defineProperty(oldTurnSpy, 'action', {
            value: oldAction,
            writable: false
        });
        Object.defineProperty(game, 'turn', {
            value: turnSpy,
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
        const whiteResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(whitePossiblePlays, whitePosition);
        const blackResult: Array<Vec2> = game.getIntermediateTurnPossiblePlaysTest(blackPossiblePlays, blackPosition);

        // Then
        expect(whiteResult).toEqual(expectedWhitePossiblePlays);
        expect(blackResult).toEqual(expectedBlackPossiblePlays);
    });
});
