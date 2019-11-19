import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
import { RoomService } from 'src/app/services/room/room.service';
import { RoomManager } from '../../room-manager/room-manager';
import { NotifierFlow } from '../../notifier/notifier';
import { PieceColor } from '../rules/chess-rules';
import SynchronousChessGame from '../games/synchronous-chess-game';
import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Player, PlayerType } from '../../player/player';
import { SessionConfiguration } from './synchronous-chess-game-session';

describe('SynchronousChessOnlineHostGameSession', () => {

    let roomServiceSpy: jasmine.SpyObj<RoomService>;
    let roomManagerSpy: jasmine.SpyObj<RoomManager>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<RoomService>('RoomService', ['notifier', 'localPlayer', 'isReady', 'transmitMessage']);
        roomManagerSpy = jasmine.createSpyObj<RoomManager>('RoomManager', ['notifier']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        Object.defineProperty(roomManagerSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        roomServiceSpy.isReady.and.returnValue(true);
    });

    it('should create an instance', () => {
        expect(new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined)).toBeTruthy();
    });

    it('should get the color of the playing player', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'a' },
            writable: false
        });
        const sessionWhite: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        sessionWhite.configuration.whitePlayer = 'a';
        sessionWhite.configuration.blackPlayer = 'b';
        const sessionBlack: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        sessionBlack.configuration.blackPlayer = 'a';
        sessionBlack.configuration.whitePlayer = 'b';
        const sessionNone: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        sessionNone.configuration.blackPlayer = 'c';
        sessionNone.configuration.whitePlayer = 'b';

        // When
        const whiteColor: PieceColor = sessionWhite.playerColor;
        const blackColor: PieceColor = sessionBlack.playerColor;
        const noneColor: PieceColor = sessionNone.playerColor;

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
        const session1: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        session1.configuration.whitePlayer = 'a';
        session1.configuration.blackPlayer = undefined;
        const session2: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        session2.configuration.whitePlayer = undefined;
        session2.configuration.blackPlayer = 'a';
        const session3: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        session3.configuration.whitePlayer = 'a';
        session3.configuration.blackPlayer = 'b';


        // When
        roomServiceSpy.isReady.and.returnValue(true);
        const color1: PieceColor = session1.playerColor;
        const color2: PieceColor = session2.playerColor;
        roomServiceSpy.isReady.and.returnValue(false);
        const color3: PieceColor = session3.playerColor;

        // Then
        expect(color1).toEqual(PieceColor.NONE);
        expect(color2).toEqual(PieceColor.NONE);
        expect(color3).toEqual(PieceColor.NONE);
    });

    it('should return true on valid play', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['applyPlay']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.applyPlay.and.returnValue(true);

        // When
        const playIsValid: boolean = session.play([1, 1], [1, 2]);

        // Then
        expect(playIsValid).toBeTruthy();
        expect(roomServiceSpy.transmitMessage.calls.count()).toEqual(1);
    });

    it('should return false on valid play', () => {
        // Given
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['applyPlay']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, undefined);
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.applyPlay.and.returnValue(false);

        // When
        const playIsValid: boolean = session.play([1, 1], [1, 2]);

        // Then
        expect(playIsValid).toBeFalsy();
        expect(roomServiceSpy.transmitMessage.calls.count()).toEqual(0);
    });

    it('should call play into the zone', () => {
        // Given
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
        const playSpy: jasmine.Spy = jasmine.createSpy('play');
        session.play = playSpy;

        // When
        session.onPlay({ from: [2, 2], to: [2, 3] });

        // Then
        expect(playSpy.calls.count()).toEqual(1);
    });

    it('should set players on player add', () => {
        // Given
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
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
});
