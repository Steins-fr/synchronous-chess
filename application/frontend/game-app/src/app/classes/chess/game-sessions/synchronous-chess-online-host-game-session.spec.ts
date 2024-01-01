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
import { Player, PlayerType } from '@app/classes/player/player';
import { WebRtcPlayer } from '@app/classes/player/web-rtc-player';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { Webrtc } from '@app/classes/webrtc/webrtc';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { Room } from '@app/services/room-manager/classes/room/room';

class ProtectedTest extends SynchronousChessOnlineHostGameSession {
    public override onMove(message: RoomMessage<SCGameSessionType, PlayMessage>): void {
        super.onMove(message);
    }

    public override onPromotion(message: RoomMessage<SCGameSessionType, PromotionMessage>): void {
        super.onPromotion(message);
    }
}

describe('SynchronousChessOnlineHostGameSession', () => {

    let roomServiceSpy: jasmine.SpyObj<Room<any>>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<Room<any>>('RoomService', ['transmitMessage', 'roomManagerNotifier']);
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
        expect(new SynchronousChessOnlineHostGameSession(roomServiceSpy)).toBeTruthy();
    });

    it('should get the color of the playing player', () => {
        // Given
        Object.defineProperty(roomServiceSpy, 'localPlayer', {
            value: { name: 'a' },
            writable: false
        });
        const sessionWhite: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        sessionWhite.configuration.whitePlayer = 'a';
        sessionWhite.configuration.blackPlayer = 'b';
        const sessionBlack: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        sessionBlack.configuration.blackPlayer = 'a';
        sessionBlack.configuration.whitePlayer = 'b';
        const sessionNone: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
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
        const session1: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        session1.configuration.whitePlayer = 'a';
        session1.configuration.blackPlayer = undefined;
        const session2: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        session2.configuration.whitePlayer = undefined;
        session2.configuration.blackPlayer = 'a';
        const session3: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        session3.configuration.whitePlayer = 'c';
        session3.configuration.blackPlayer = 'b';
        const session4: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        session4.configuration.whitePlayer = 'a';
        session4.configuration.blackPlayer = 'b';


        // When
        const color1: PieceColor = session1.playingColor;
        const color2: PieceColor = session2.playingColor;
        const color3: PieceColor = session3.playingColor;
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
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
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
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
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
        // Given
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
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
        // Given
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        const defaultConfiguration: SessionConfiguration = { ...session.configuration };
        const player1: Player = new WebRtcPlayer('robert', PlayerType.HOST, null as unknown as Webrtc);
        const player2: Player = new WebRtcPlayer('mario', PlayerType.HOST, null as unknown as Webrtc);
        const player3: Player = new WebRtcPlayer('bertrand', PlayerType.HOST, null as unknown as Webrtc);
        const player4: Player = new WebRtcPlayer('romain', PlayerType.HOST, null as unknown as Webrtc);

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
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
        session.configuration = {
            whitePlayer: 'robert',
            blackPlayer: 'mario',
            spectatorNumber: 2
        };
        const player1: Player = new WebRtcPlayer('robert', PlayerType.HOST, null as unknown as Webrtc);
        const player2: Player = new WebRtcPlayer('mario', PlayerType.HOST, null as unknown as Webrtc);
        const player3: Player = new WebRtcPlayer('bertrand', PlayerType.HOST, null as unknown as Webrtc);
        const player4: Player = new WebRtcPlayer('romain', PlayerType.HOST, null as unknown as Webrtc);

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
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
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
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomServiceSpy);
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
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
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
        // Given
        const session: ProtectedTest = new ProtectedTest(roomServiceSpy);
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
