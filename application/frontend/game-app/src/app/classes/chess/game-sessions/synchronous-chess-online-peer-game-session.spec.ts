import { SessionConfiguration } from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessOnlinePeerGameSession
    from '@app/classes/chess/game-sessions/synchronous-chess-online-peer-game-session';
import SynchronousChessGame from '@app/classes/chess/games/synchronous-chess-game';
import { Coordinate, Column, Row } from '@app/classes/chess/interfaces/CoordinateMove';
import Move, { FenColumn, FenRow } from '@app/classes/chess/interfaces/move';
import { PieceColor, PieceType } from '@app/classes/chess/rules/chess-rules';
import { NotifierFlow } from '@app/classes/notifier/notifier';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { ToReworkMessage } from '@app/classes/webrtc/messages/to-rework-message';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { Room } from '@app/services/room-manager/classes/room/room';

class ProtectedTest extends SynchronousChessOnlinePeerGameSession {
    public override runMove(color: PieceColor, move: Move): boolean {
        return super.runMove(color, move);
    }

    public override runPromotion(color: PieceColor, pieceType: PieceType): boolean {
        return super.runPromotion(color, pieceType);
    }
}

describe('SynchronousChessOnlinePeerGameSession', () => {

    let roomServiceSpy: jasmine.SpyObj<Room<any>>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<Room<any>>('RoomService', ['roomManagerNotifier']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        Object.defineProperty(roomServiceSpy, 'roomManagerNotifier', {
            value: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
    });

    it('should create an instance', () => {
        expect(new SynchronousChessOnlinePeerGameSession(roomServiceSpy)).toBeTruthy();
    });

    it('should set the configuration', () => {
        // Given
        const session: SynchronousChessOnlinePeerGameSession = new SynchronousChessOnlinePeerGameSession(roomServiceSpy);
        const configuration: ToReworkMessage<SessionConfiguration> = {
            from: 'a',
            // FIXME: value of origin
            origin: MessageOriginType.HOST_ROOM,
            payload: {
                whitePlayer: 'e',
                blackPlayer: 'd',
                spectatorNumber: 3,
            }
        };

        // When
        session.onConfiguration(configuration);

        // Then
        expect(session.configuration).toBe(configuration.payload);
    });

    it('should return false if runMove move a piece from another color', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });

        const color: PieceColor = PieceColor.BLACK;
        const move: Move = {
            from: [FenColumn.A, FenRow._1],
            to: [FenColumn.A, FenRow._1]
        };

        // When
        const result: boolean = session.runMove(color, move);

        // Then
        expect(result).toBeFalsy();
    });

    it('should return false if runMove try an invalid move', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });

        gameSpy.registerMove.and.returnValue(false);
        const color: PieceColor = PieceColor.BLACK;
        const move: Move = {
            from: [FenColumn.A, FenRow._7],
            to: [FenColumn.A, FenRow._4]
        };
        // When
        const result: boolean = session.runMove(color, move);

        // Then
        expect(result).toBeFalsy();
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
    });

    it('should set the preview if runMove register my valid move', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'b' },
            writable: false
        });

        const color: PieceColor = PieceColor.BLACK;
        const move: Move = {
            from: [FenColumn.A, FenRow._7],
            to: [FenColumn.A, FenRow._4]
        };
        session.movePreview = undefined;
        gameSpy.registerMove.and.returnValue(true);
        gameSpy.runTurn.and.returnValue(false);

        // When
        const result: boolean = session.runMove(color, move);

        // Then
        expect(result).toBeTruthy();
        expect(session.movePreview).not.toEqual(undefined);
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('should not set the preview if runMove register opponent valid move', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'a' },
            writable: false
        });

        const color: PieceColor = PieceColor.BLACK;
        const move: Move = {
            from: [FenColumn.A, FenRow._7],
            to: [FenColumn.A, FenRow._4]
        };
        session.movePreview = undefined;
        gameSpy.registerMove.and.returnValue(true);
        gameSpy.runTurn.and.returnValue(false);

        // When
        const result: boolean = session.runMove(color, move);

        // Then
        expect(result).toBeTruthy();
        expect(session.movePreview).toEqual(undefined);
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('should unset the preview if runMove trigger runTurn === true', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'a' },
            writable: false
        });

        const color: PieceColor = PieceColor.BLACK;
        const from: Coordinate = [Column.A, Row._7];
        const to: Coordinate = [Column.A, Row._4];
        const move: Move = {
            from: [FenColumn.A, FenRow._7],
            to: [FenColumn.A, FenRow._4]
        };
        session.movePreview = { from, to };
        gameSpy.registerMove.and.returnValue(true);
        gameSpy.runTurn.and.returnValue(true);

        // When
        const result: boolean = session.runMove(color, move);

        // Then
        expect(result).toBeTruthy();
        expect(session.movePreview).toBeUndefined();
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('runPromotion should return false if promote failed', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['promote', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        gameSpy.promote.and.returnValue(false);
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });

        const color: PieceColor = PieceColor.BLACK;
        const pieceType: PieceType = PieceType.QUEEN;
        // When
        const result: boolean = session.runPromotion(color, pieceType);

        // Then
        expect(result).toBeFalsy();
    });

    it('runPromotion should return false if promote succeed', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['promote', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        gameSpy.promote.and.returnValue(true);
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });

        const color: PieceColor = PieceColor.BLACK;
        const pieceType: PieceType = PieceType.QUEEN;
        // When
        const result: boolean = session.runPromotion(color, pieceType);

        // Then
        expect(result).toBeTruthy();
    });
});
