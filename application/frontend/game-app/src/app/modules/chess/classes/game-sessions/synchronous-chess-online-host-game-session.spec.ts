import { sessionState } from '@testing/chess-state.helper';
import { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import { ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import SynchronousChessOnlineHostGameSession
    from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-host-game-session';
import SynchronousChessGame from '@app/modules/chess/classes/games/synchronous-chess-game';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { AppMessagesOf } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { Subject } from 'rxjs';
import { vi, describe, test, expect, onTestFinished } from 'vitest';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Player } from '@app/services/room-manager/classes/player/player';

describe('SynchronousChessOnlineHostGameSession', () => {
    test('should get the color of the playing player', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'a' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());

        const sessionWhite: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(sessionWhite).setConfiguration({ ...sessionWhite.configuration(), whitePlayer: 'a' });
        sessionState(sessionWhite).setConfiguration({ ...sessionWhite.configuration(), blackPlayer: 'b' });
        const sessionBlack: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(sessionBlack).setConfiguration({ ...sessionBlack.configuration(), blackPlayer: 'a' });
        sessionState(sessionBlack).setConfiguration({ ...sessionBlack.configuration(), whitePlayer: 'b' });
        const sessionNone: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(sessionNone).setConfiguration({ ...sessionNone.configuration(), blackPlayer: 'c' });
        sessionState(sessionNone).setConfiguration({ ...sessionNone.configuration(), whitePlayer: 'b' });

        // When
        const whiteColor: PieceColor = sessionWhite.playingColor;
        const blackColor: PieceColor = sessionBlack.playingColor;
        const noneColor: PieceColor = sessionNone.playingColor;

        // Then
        expect(whiteColor).toEqual(PieceColor.WHITE);
        expect(blackColor).toEqual(PieceColor.BLACK);
        expect(noneColor).toEqual(PieceColor.NONE);
    });

    test('should get the none color', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'a' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session1: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session1).setConfiguration({ ...session1.configuration(), whitePlayer: 'a' });
        sessionState(session1).setConfiguration({ ...session1.configuration(), blackPlayer: undefined });
        expect(session1.playingColor).toEqual(PieceColor.NONE);

        const session2: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session2).setConfiguration({ ...session2.configuration(), whitePlayer: undefined });
        sessionState(session2).setConfiguration({ ...session2.configuration(), blackPlayer: 'a' });
        expect(session2.playingColor).toEqual(PieceColor.NONE);

        const session3: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session3).setConfiguration({ ...session3.configuration(), whitePlayer: 'c' });
        sessionState(session3).setConfiguration({ ...session3.configuration(), blackPlayer: 'b' });
        expect(session3.playingColor).toEqual(PieceColor.NONE);

        const session4: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);

        const gameSpy = TestHelper.cast<SynchronousChessGame>({
            registerMove: vi.fn(),
            isMoveValid: vi.fn(),
            runTurn: vi.fn(),
            colorHasPlayed: vi.fn(),
        });
        Object.defineProperty(session4, 'game', {
            value: gameSpy,
            writable: false
        });
        vi.mocked(gameSpy.colorHasPlayed).mockReturnValue(true);

        sessionState(session4).setConfiguration({ ...session4.configuration(), whitePlayer: 'a' });
        sessionState(session4).setConfiguration({ ...session4.configuration(), blackPlayer: 'b' });
        expect(session4.playingColor).toEqual(PieceColor.NONE);
    });

    test('should set players on player add', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        const defaultConfiguration: SessionConfiguration = { ...session.configuration() };

        const webrtc = new WebrtcMock().webrtc;

        const player1: Player = new WebRtcPlayer('robert', webrtc);
        const player2: Player = new WebRtcPlayer('mario', webrtc);
        const player3: Player = new WebRtcPlayer('bertrand', webrtc);
        const player4: Player = new WebRtcPlayer('romain', webrtc);
        onTestFinished(() => [player1, player2, player3, player4].forEach((player: Player) => player.clear()));

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
        const inter1Configuration: SessionConfiguration = { ...session.configuration() };
        session.onPlayerAdd(player2);
        const inter2Configuration: SessionConfiguration = { ...session.configuration() };
        session.onPlayerAdd(player3);
        session.onPlayerAdd(player4);
        const endConfiguration: SessionConfiguration = { ...session.configuration() };

        // Then
        expect(defaultConfiguration).toEqual(expectedDefaultConfiguration);
        expect(inter1Configuration).toEqual(expectedInter1Configuration);
        expect(inter2Configuration).toEqual(expectedInter2Configuration);
        expect(endConfiguration).toEqual(expectedEndConfiguration);
    });

    test('should decrement spectators on player remove', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session).setConfiguration({
            whitePlayer: 'robert',
            blackPlayer: 'mario',
            spectatorNumber: 2
        });
        const webrtc = new WebrtcMock().webrtc;

        const player1: Player = new WebRtcPlayer('robert', webrtc);
        const player2: Player = new WebRtcPlayer('mario', webrtc);
        const player3: Player = new WebRtcPlayer('bertrand', webrtc);
        const player4: Player = new WebRtcPlayer('romain', webrtc);
        onTestFinished(() => [player1, player2, player3, player4].forEach((player: Player) => player.clear()));

        // When
        session.onPlayerRemove(player1);
        const inter1Configuration: SessionConfiguration = { ...session.configuration() };
        session.onPlayerRemove(player2);
        const inter2Configuration: SessionConfiguration = { ...session.configuration() };
        session.onPlayerRemove(player3);
        session.onPlayerRemove(player4);
        const endConfiguration: SessionConfiguration = { ...session.configuration() };

        // Then
        expect(inter1Configuration.spectatorNumber).toEqual(2);
        expect(inter2Configuration.spectatorNumber).toEqual(2);
        expect(endConfiguration.spectatorNumber).toEqual(0);
    });

    test('should update the configuration on room player streams until destroyed', () => {
        const playerAdded$ = new Subject<Player>();
        const playerRemoved$ = new Subject<Player>();
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$,
            playerRemoved$,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);

        // When
        playerAdded$.next({ name: 'a' } as Player);
        playerAdded$.next({ name: 'b' } as Player);
        playerAdded$.next({ name: 'c' } as Player);

        // Then
        expect(session.configuration()).toEqual({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 1 });
        expect(roomSpy.transmitMessage).toHaveBeenCalledTimes(3);

        // When
        playerRemoved$.next({ name: 'c' } as Player);

        // Then
        expect(session.configuration().spectatorNumber).toEqual(0);

        // When
        session.destroy();
        playerAdded$.next({ name: 'd' } as Player);

        // Then
        expect(session.configuration().spectatorNumber).toEqual(0);
        expect(roomSpy.transmitMessage).toHaveBeenCalledTimes(3);
    });

});
