import SynchronousChessOnlinePeerGameSession from './synchronous-chess-online-peer-game-session';
import { RoomService } from '../../../services/room/room.service';
import { NotifierFlow } from '../../notifier/notifier';
import { RoomManager } from '../../room-manager/room-manager';
import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { SessionConfiguration } from './synchronous-chess-game-session';
import { PieceColor, PieceType } from '../rules/chess-rules';
import { Coordinate, Column, Row } from '../interfaces/CoordinateMove';
import SynchronousChessGame from '../games/synchronous-chess-game';
import ChessBoardHelper from '../../../helpers/chess-board-helper';
import Move, { FenColumn, FenRow } from '../interfaces/move';

class ProtectedTest extends SynchronousChessOnlinePeerGameSession {
    public runMove(color: PieceColor, move: Move): boolean {
        return super.runMove(color, move);
    }

    public runPromotion(color: PieceColor, pieceType: PieceType): boolean {
        return super.runPromotion(color, pieceType);
    }
}

describe('SynchronousChessOnlinePeerGameSession', () => {

    let roomServiceSpy: jasmine.SpyObj<RoomService>;
    let roomManagerSpy: jasmine.SpyObj<RoomManager>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<RoomService>('RoomService', ['notifier']);
        roomManagerSpy = jasmine.createSpyObj<RoomManager>('RoomManager', ['notifier']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        Object.defineProperty(roomManagerSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
    });

    it('should create an instance', () => {
        expect(new SynchronousChessOnlinePeerGameSession(roomServiceSpy, roomManagerSpy, undefined)).toBeTruthy();
    });

    it('should set the configuration', () => {
        // Given
        const session: SynchronousChessOnlinePeerGameSession = new SynchronousChessOnlinePeerGameSession(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
        const configuration: SessionConfiguration = {
            whitePlayer: 'e',
            blackPlayer: 'd',
            spectatorNumber: 3
        };

        // When
        session.onConfiguration(configuration);

        // Then
        expect(session.configuration).toBe(configuration);
    });

    it('should return false if runMove move a piece from another color', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        expect(session.movePreview).toEqual(undefined);
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
