import { SessionConfiguration } from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import {
    SCGameSessionType,
    PlayMessage,
    PromotionMessage
} from '@app/classes/chess/game-sessions/synchronous-chess-online-game-session';
import SynchronousChessOnlineHostGameSession
    from '@app/classes/chess/game-sessions/synchronous-chess-online-host-game-session';
import SynchronousChessGame from '@app/classes/chess/games/synchronous-chess-game';
import Move, { FenColumn, FenRow } from '@app/classes/chess/interfaces/move';
import { PieceColor, PieceType } from '@app/classes/chess/rules/chess-rules';
import { NotifierFlow } from '@app/classes/notifier/notifier';
import { LocalPlayer } from '@app/classes/player/local-player';
import { Player, PlayerType } from '@app/classes/player/player';
import { WebRtcPlayer } from '@app/classes/player/web-rtc-player';
import { Message } from '@app/classes/webrtc/messages/message';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { Webrtc } from '@app/classes/webrtc/webrtc';
import WebrtcStates from '@app/classes/webrtc/webrtc-states';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subject } from 'rxjs';

class ProtectedTest extends SynchronousChessOnlineHostGameSession {
    public override onMove(message: RoomMessage<SCGameSessionType, PlayMessage>): void {
        super.onMove(message);
    }

    public override onPromotion(message: RoomMessage<SCGameSessionType, PromotionMessage>): void {
        super.onPromotion(message);
    }
}

describe('SynchronousChessOnlineHostGameSession', () => {
    it('should get the color of the playing player', () => {
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            localPlayer: { name: 'a' } as LocalPlayer,
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());

        const sessionWhite: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionWhite.configuration.whitePlayer = 'a';
        sessionWhite.configuration.blackPlayer = 'b';
        const sessionBlack: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionBlack.configuration.blackPlayer = 'a';
        sessionBlack.configuration.whitePlayer = 'b';
        const sessionNone: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
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
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            localPlayer: { name: 'a' } as LocalPlayer,
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session1: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        session1.configuration.whitePlayer = 'a';
        session1.configuration.blackPlayer = undefined;
        expect(session1.playingColor).toEqual(PieceColor.NONE);

        const session2: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        session2.configuration.whitePlayer = undefined;
        session2.configuration.blackPlayer = 'a';
        expect(session2.playingColor).toEqual(PieceColor.NONE);

        const session3: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        session3.configuration.whitePlayer = 'c';
        session3.configuration.blackPlayer = 'b';
        expect(session3.playingColor).toEqual(PieceColor.NONE);

        const session4: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);

        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn', 'colorHasPlayed']);
        Object.defineProperty(session4, 'game', {
            value: gameSpy,
            writable: false
        });
        gameSpy.colorHasPlayed.and.returnValue(true);

        session4.configuration.whitePlayer = 'a';
        session4.configuration.blackPlayer = 'b';
        expect(session4.playingColor).toEqual(PieceColor.NONE);
    });

    it('move should return true on valid play', () => {
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger', 'transmitMessage'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
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
        expect(roomSpy.transmitMessage.calls.count()).toEqual(1);
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('move should return false on invalid move', () => {
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger', 'transmitMessage'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['registerMove', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
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
        expect(roomSpy.transmitMessage.calls.count()).toEqual(0);
        expect(gameSpy.registerMove.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(0);
    });

    it('should run move from a remote playing player', () => {
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
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
        const message: RoomMessage<SCGameSessionType, PlayMessage> = {
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
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
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
        const message: RoomMessage<SCGameSessionType, PlayMessage> = {
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
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger', 'transmitMessage'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        const defaultConfiguration: SessionConfiguration = { ...session.configuration };

        const webRtcSpy: jasmine.SpyObj<Webrtc> = jasmine.createSpyObj<Webrtc>('Webrtc', ['close'], {
            states: new Subject<WebrtcStates>(),
            data: new Subject<Message>(),
        });

        const player1: Player = new WebRtcPlayer('robert', PlayerType.HOST, webRtcSpy);
        const player2: Player = new WebRtcPlayer('mario', PlayerType.HOST, webRtcSpy);
        const player3: Player = new WebRtcPlayer('bertrand', PlayerType.HOST, webRtcSpy);
        const player4: Player = new WebRtcPlayer('romain', PlayerType.HOST, webRtcSpy);

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
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger', 'transmitMessage'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        session.configuration = {
            whitePlayer: 'robert',
            blackPlayer: 'mario',
            spectatorNumber: 2
        };
        const webRtcSpy: jasmine.SpyObj<Webrtc> = jasmine.createSpyObj<Webrtc>('Webrtc', ['close'], {
            states: new Subject<WebrtcStates>(),
            data: new Subject<Message>(),
        });

        const player1: Player = new WebRtcPlayer('robert', PlayerType.HOST, webRtcSpy);
        const player2: Player = new WebRtcPlayer('mario', PlayerType.HOST, webRtcSpy);
        const player3: Player = new WebRtcPlayer('bertrand', PlayerType.HOST, webRtcSpy);
        const player4: Player = new WebRtcPlayer('romain', PlayerType.HOST, webRtcSpy);

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
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger', 'transmitMessage'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['promote', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
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
        expect(roomSpy.transmitMessage.calls.count()).toEqual(1);
        expect(gameSpy.promote.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(1);
    });

    it('promote should return false on invalid move', () => {
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger', 'transmitMessage'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const gameSpy: jasmine.SpyObj<SynchronousChessGame> = jasmine.createSpyObj<SynchronousChessGame>('SynchronousChessGame', ['promote', 'isMoveValid', 'runTurn']);
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
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
        expect(roomSpy.transmitMessage.calls.count()).toEqual(0);
        expect(gameSpy.promote.calls.count()).toEqual(1);
        expect(gameSpy.runTurn.calls.count()).toEqual(0);
    });

    it('should run promote from a remote playing player', () => {
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        const runPromotionSpy: jasmine.Spy = jasmine.createSpy('runPromotion');
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };

        Object.defineProperty(session, 'runPromotion', {
            value: runPromotionSpy,
            writable: false
        });
        const pieceType: PieceType = PieceType.QUEEN;
        const message: RoomMessage<SCGameSessionType, PromotionMessage> = {
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
        const roomSpy = jasmine.createSpyObj<Room<any>>('Room', ['messenger'], {
            roomManagerNotifier: jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']),
        });
        roomSpy.messenger.and.returnValue(new Subject<RoomMessage>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        const runPromotionSpy: jasmine.Spy = jasmine.createSpy('runPromotion');
        session.configuration = { whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 };

        Object.defineProperty(session, 'runPromotion', {
            value: runPromotionSpy,
            writable: false
        });
        const pieceType: PieceType = PieceType.QUEEN;
        const message: RoomMessage<SCGameSessionType, PromotionMessage> = {
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
