import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
import { RoomService } from '../../../services/room/room.service';
import { NotifierFlow } from '../../notifier/notifier';
import { PieceColor, PieceType } from '../rules/chess-rules';
import SynchronousChessGame from '../games/synchronous-chess-game';
import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Player, PlayerType } from '../../player/player';
import { SessionConfiguration } from './synchronous-chess-game-session';
import { RoomServiceMessage } from '../../webrtc/messages/room-service-message';
import { SCGameSessionType, PlayMessage, PromotionMessage } from './synchronous-chess-online-game-session';
import MessageOriginType from '../../webrtc/messages/message-origin.types';
import ChessBoardHelper from '../../../helpers/chess-board-helper';
import Move, { FenColumn, FenRow } from '../interfaces/move';

class ProtectedTest extends SynchronousChessOnlineHostGameSession {
    public override onMove(message: RoomServiceMessage<SCGameSessionType, PlayMessage>): void {
        super.onMove(message);
    }

    public override onPromotion(message: RoomServiceMessage<SCGameSessionType, PromotionMessage>): void {
        super.onPromotion(message);
    }
}

describe('SynchronousChessOnlineHostGameSession', () => {

    let roomServiceSpy: jasmine.SpyObj<RoomService<any>>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<RoomService<any>>('RoomService', ['notifier', 'localPlayer', 'isReady', 'transmitMessage', 'roomManagerNotifier']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        Object.defineProperty(roomServiceSpy, 'roomManagerNotifier', {
            value: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        roomServiceSpy.isReady.and.returnValue(true);
    });

    it('should create an instance', () => {
        expect(new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone)).toBeTruthy();
    });

    it('should get the color of the playing player', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'a' },
            writable: false
        });
        const sessionWhite: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        sessionWhite.configuration.whitePlayer = 'a';
        sessionWhite.configuration.blackPlayer = 'b';
        const sessionBlack: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        sessionBlack.configuration.blackPlayer = 'a';
        sessionBlack.configuration.whitePlayer = 'b';
        const sessionNone: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        sessionNone.configuration.blackPlayer = 'c';
        sessionNone.configuration.whitePlayer = 'b';

        // When
        const whiteColor: PieceColor = sessionWhite.playingColor;
        const blackColor: PieceColor = sessionBlack.playingColor;
        const noneColor: PieceColor = sessionNone.playingColor;

        // Then
        expect(whiteColor).toEqual(PieceColor.WHITE);
        expect(blackColor).toEqual(PieceColor.BLACK);
        expect(noneColor).toEqual(PieceColor.NONE);
    });

    it('should get the none color', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'a' },
            writable: false
        });
        const session1: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session1.configuration.whitePlayer = 'a';
        session1.configuration.blackPlayer = undefined;
        const session2: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session2.configuration.whitePlayer = undefined;
        session2.configuration.blackPlayer = 'a';
        const session3: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session3.configuration.whitePlayer = 'c';
        session3.configuration.blackPlayer = 'b';
        const session4: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session4.configuration.whitePlayer = 'a';
        session4.configuration.blackPlayer = 'b';


        // When
        roomServiceSpy.isReady.and.returnValue(true);
        const color1: PieceColor = session1.playingColor;
        const color2: PieceColor = session2.playingColor;
        const color3: PieceColor = session3.playingColor;
        roomServiceSpy.isReady.and.returnValue(false);
        const color4: PieceColor = session4.playingColor;

        // Then
        expect(color1).toEqual(PieceColor.NONE);
        expect(color2).toEqual(PieceColor.NONE);
        expect(color3).toEqual(PieceColor.NONE);
        expect(color4).toEqual(PieceColor.NONE);
    });

    it('move should return true on valid play', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'b' },
            writable: false
        });
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session.configuration.whitePlayer = 'a';
        session.configuration.blackPlayer = 'b';
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.registerMove.and.returnValue(true);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const move: Move = {
            from: [FenColumn.B, FenRow._7],
            to: [FenColumn.B, FenRow._6]
        };

        // When
        session.move(move);
        // Then
        expect(roomServiceSpy.transmitMessage.calls.count()).toEqual(1);
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('move should return false on invalid move', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'b' },
            writable: false
        });
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session.configuration.whitePlayer = 'a';
        session.configuration.blackPlayer = 'b';
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.registerMove.and.returnValue(false);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: ChessBoardHelper.createFenBoard(),
            writable: false
        });
        const move: Move = {
            from: [FenColumn.B, FenRow._7],
            to: [FenColumn.B, FenRow._2]
        };

        // When
        session.move(move);

        // Then
        expect(roomServiceSpy.transmitMessage.calls.count()).toEqual(0);
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(0);
    });

    it('should run move from a remote playing player', () => {
        // Given
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, TestBed.inject(NgZone));
        const runMoveSpy: jasmine.Spy = jasmine.createSpy('runMove');
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };

        Object.defineProperty(session, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        const move: Move = {
            from: [FenColumn.C, FenRow._6],
            to: [FenColumn.C, FenRow._5]
        };
        const message: RoomServiceMessage<SCGameSessionType, PlayMessage> = {
            from: 'a',
            origin: MessageOriginType.ROOM_SERVICE,
            type: SCGameSessionType.PLAY,
            payload: { move }
        };
        // When
        session.onMove(message);

        // Then
        expect(runMoveSpy.calls.count()).toEqual(1);
    });

    it('should not run move from a remote spectator', () => {
        // Given
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, TestBed.inject(NgZone));
        const runMoveSpy: jasmine.Spy = jasmine.createSpy('runMove');
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };

        Object.defineProperty(session, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        const move: Move = {
            from: [FenColumn.C, FenRow._6],
            to: [FenColumn.C, FenRow._5]
        };
        const message: RoomServiceMessage<SCGameSessionType, PlayMessage> = {
            from: 'C',
            origin: MessageOriginType.ROOM_SERVICE,
            type: SCGameSessionType.PLAY,
            payload: { move }
        };
        // When
        session.onMove(message);

        // Then
        expect(runMoveSpy.calls.count()).toEqual(0);
    });

    it('should set players on player add', () => {
        // Given
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, TestBed.inject(NgZone));
        const defaultConfiguration: SessionConfiguration = { ...session.configuration };
        const player1: Player = new Player('robert', PlayerType.HOST);
        const player2: Player = new Player('mario', PlayerType.HOST);
        const player3: Player = new Player('bertrand', PlayerType.HOST);
        const player4: Player = new Player('romain', PlayerType.HOST);

        const expectedDefaultConfiguration: SessionConfiguration = {
            spectatorNumber: 0
        };

        const expectedInter1Configuration: SessionConfiguration = {
            whitePlayer: 'robert',
            spectatorNumber: 0
        };

        const expectedInter2Configuration: SessionConfiguration = {
            whitePlayer: 'robert',
            blackPlayer: 'mario',
            spectatorNumber: 0
        };


        const expectedEndConfiguration: SessionConfiguration = {
            whitePlayer: 'robert',
            blackPlayer: 'mario',
            spectatorNumber: 2
        };
        // When
        session.onPlayerAdd(player1);
        const inter1Configuration: SessionConfiguration = { ...session.configuration };
        session.onPlayerAdd(player2);
        const inter2Configuration: SessionConfiguration = { ...session.configuration };
        session.onPlayerAdd(player3);
        session.onPlayerAdd(player4);
        const endConfiguration: SessionConfiguration = { ...session.configuration };

        // Then
        expect(defaultConfiguration).toEqual(expectedDefaultConfiguration);
        expect(inter1Configuration).toEqual(expectedInter1Configuration);
        expect(inter2Configuration).toEqual(expectedInter2Configuration);
        expect(endConfiguration).toEqual(expectedEndConfiguration);
    });

    it('should decrement spectators on player remove', () => {
        // Given
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, TestBed.inject(NgZone));
        session.configuration = {
            whitePlayer: 'robert',
            blackPlayer: 'mario',
            spectatorNumber: 2
        };
        const player1: Player = new Player('robert', PlayerType.HOST);
        const player2: Player = new Player('mario', PlayerType.HOST);
        const player3: Player = new Player('bertrand', PlayerType.HOST);
        const player4: Player = new Player('romain', PlayerType.HOST);

        // When
        session.onPlayerRemove(player1);
        const inter1Configuration: SessionConfiguration = { ...session.configuration };
        session.onPlayerRemove(player2);
        const inter2Configuration: SessionConfiguration = { ...session.configuration };
        session.onPlayerRemove(player3);
        session.onPlayerRemove(player4);
        const endConfiguration: SessionConfiguration = { ...session.configuration };

        // Then
        expect(inter1Configuration.spectatorNumber).toEqual(2);
        expect(inter2Configuration.spectatorNumber).toEqual(2);
        expect(endConfiguration.spectatorNumber).toEqual(0);
    });

    it('promote should return true on valid play', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'b' },
            writable: false
        });
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['promote', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session.configuration.whitePlayer = 'a';
        session.configuration.blackPlayer = 'b';
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.promote.and.returnValue(true);
        const pieceType: PieceType = PieceType.QUEEN;

        // When
        session.promote(pieceType);
        // Then
        expect(roomServiceSpy.transmitMessage.calls.count()).toEqual(1);
        expect(gameSpy.promote.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('promote should return false on invalid move', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'b' },
            writable: false
        });
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['promote', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, null as unknown as NgZone);
        session.configuration.whitePlayer = 'a';
        session.configuration.blackPlayer = 'b';
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.promote.and.returnValue(false);
        const pieceType: PieceType = PieceType.QUEEN;

        // When
        session.promote(pieceType);

        // Then
        expect(roomServiceSpy.transmitMessage.calls.count()).toEqual(0);
        expect(gameSpy.promote.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(0);
    });

    it('should run promote from a remote playing player', () => {
        // Given
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, TestBed.inject(NgZone));
        const runPromotionSpy: jasmine.Spy = jasmine.createSpy('runPromotion');
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };

        Object.defineProperty(session, 'runPromotion', {
            value: runPromotionSpy,
            writable: false
        });
        const pieceType: PieceType = PieceType.QUEEN;
        const message: RoomServiceMessage<SCGameSessionType, PromotionMessage> = {
            from: 'a',
            origin: MessageOriginType.ROOM_SERVICE,
            type: SCGameSessionType.PLAY,
            payload: { pieceType }
        };
        // When
        session.onPromotion(message);

        // Then
        expect(runPromotionSpy.calls.count()).toEqual(1);
    });

    it('should not run promote from a remote spectator', () => {
        // Given
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy, TestBed.inject(NgZone));
        const runPromotionSpy: jasmine.Spy = jasmine.createSpy('runPromotion');
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };

        Object.defineProperty(session, 'runPromotion', {
            value: runPromotionSpy,
            writable: false
        });
        const pieceType: PieceType = PieceType.QUEEN;
        const message: RoomServiceMessage<SCGameSessionType, PromotionMessage> = {
            from: 'C',
            origin: MessageOriginType.ROOM_SERVICE,
            type: SCGameSessionType.PLAY,
            payload: { pieceType }
        };
        // When
        session.onPromotion(message);

        // Then
        expect(runPromotionSpy.calls.count()).toEqual(0);
    });
});
