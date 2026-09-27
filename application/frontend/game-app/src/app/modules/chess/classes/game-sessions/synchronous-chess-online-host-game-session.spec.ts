import { signal } from '@angular/core';
import { sessionState } from '@testing/chess-state.helper';
import { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import {
    ChessPayloads,
    SCGameSessionType,
    PlayMessage,
    PromotionMessage
} from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import SynchronousChessOnlineHostGameSession
    from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-host-game-session';
import SynchronousChessGame from '@app/modules/chess/classes/games/synchronous-chess-game';
import Move, { FenColumn, FenRow } from '@app/modules/chess/interfaces/move';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { PieceType } from '@app/modules/chess/enums/piece-type.enum';
import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import { AppMessage, AppMessagesOf } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import WebrtcStates from '@app/services/room-manager/classes/webrtc/webrtc-states';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { vi, describe, test, expect } from 'vitest';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Player } from '@app/services/room-manager/classes/player/player';

class ProtectedTest extends SynchronousChessOnlineHostGameSession {
    public override onMove(message: AppMessage<SCGameSessionType.PLAY, PlayMessage>): void {
        super.onMove(message);
    }

    public override onPromotion(message: AppMessage<SCGameSessionType.PROMOTION, PromotionMessage>): void {
        super.onPromotion(message);
    }
}

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

    test('move should return true on valid play', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const gameSpy = TestHelper.cast<SynchronousChessGame>({
            registerMove: vi.fn(),
            isMoveValid: vi.fn(),
            runTurn: vi.fn(),
        });
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session).setConfiguration({ ...session.configuration(), whitePlayer: 'a' });
        sessionState(session).setConfiguration({ ...session.configuration(), blackPlayer: 'b' });
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        vi.mocked(gameSpy.registerMove).mockReturnValue(true);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: signal(ChessBoardHelper.createFenBoard()),
            writable: false
        });
        const move: Move = {
            from: [FenColumn.B, FenRow._7],
            to: [FenColumn.B, FenRow._6]
        };

        // When
        session.move(move);
        // Then
        expect(roomSpy.transmitMessage).toHaveBeenCalledTimes(1);
        expect(gameSpy.registerMove).toHaveBeenCalledTimes(1);
        expect(gameSpy.runTurn).toHaveBeenCalledTimes(1);
    });

    test('move should return false on invalid move', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const gameSpy = TestHelper.cast<SynchronousChessGame>({
            registerMove: vi.fn(),
            isMoveValid: vi.fn(),
            runTurn: vi.fn(),
        });
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session).setConfiguration({ ...session.configuration(), whitePlayer: 'a' });
        sessionState(session).setConfiguration({ ...session.configuration(), blackPlayer: 'b' });
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        vi.mocked(gameSpy.registerMove).mockReturnValue(false);
        Object.defineProperty(gameSpy, 'fenBoard', {
            value: signal(ChessBoardHelper.createFenBoard()),
            writable: false
        });
        const move: Move = {
            from: [FenColumn.B, FenRow._7],
            to: [FenColumn.B, FenRow._2]
        };

        // When
        session.move(move);

        // Then
        expect(roomSpy.transmitMessage).toHaveBeenCalledTimes(0);
        expect(gameSpy.registerMove).toHaveBeenCalledTimes(1);
        expect(gameSpy.runTurn).toHaveBeenCalledTimes(0);
    });

    test('should run move from a remote playing player', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        const runMoveSpy = vi.fn();
        sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 });

        Object.defineProperty(session, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        const move: Move = {
            from: [FenColumn.C, FenRow._6],
            to: [FenColumn.C, FenRow._5]
        };
        const message: AppMessage<SCGameSessionType.PLAY, PlayMessage> = {
            from: 'a',
            type: SCGameSessionType.PLAY,
            payload: { move }
        };
        // When
        session.onMove(message);

        // Then
        expect(runMoveSpy).toHaveBeenCalledTimes(1);
    });

    test('should not run move from a remote spectator', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        const runMoveSpy = vi.fn();
        sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 });

        Object.defineProperty(session, 'runMove', {
            value: runMoveSpy,
            writable: false
        });
        const move: Move = {
            from: [FenColumn.C, FenRow._6],
            to: [FenColumn.C, FenRow._5]
        };
        const message: AppMessage<SCGameSessionType.PLAY, PlayMessage> = {
            from: 'C',
            type: SCGameSessionType.PLAY,
            payload: { move }
        };
        // When
        session.onMove(message);

        // Then
        expect(runMoveSpy).toHaveBeenCalledTimes(0);
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

        const webRtcSpy = TestHelper.cast<Webrtc>({
            close: vi.fn(),
            states: new Subject<WebrtcStates>(),
            data: new Subject<Message>(),
        });

        const player1: Player = new WebRtcPlayer('robert', webRtcSpy);
        const player2: Player = new WebRtcPlayer('mario', webRtcSpy);
        const player3: Player = new WebRtcPlayer('bertrand', webRtcSpy);
        const player4: Player = new WebRtcPlayer('romain', webRtcSpy);

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
        const webRtcSpy = TestHelper.cast<Webrtc>({
            close: vi.fn(),
            states: new Subject<WebrtcStates>(),
            data: new Subject<Message>(),
        });

        const player1: Player = new WebRtcPlayer('robert', webRtcSpy);
        const player2: Player = new WebRtcPlayer('mario', webRtcSpy);
        const player3: Player = new WebRtcPlayer('bertrand', webRtcSpy);
        const player4: Player = new WebRtcPlayer('romain', webRtcSpy);

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

    test('promote should return true on valid play', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const gameSpy = TestHelper.cast<SynchronousChessGame>({
            promote: vi.fn(),
            isMoveValid: vi.fn(),
            runTurn: vi.fn(),
        });
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session).setConfiguration({ ...session.configuration(), whitePlayer: 'a' });
        sessionState(session).setConfiguration({ ...session.configuration(), blackPlayer: 'b' });
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        vi.mocked(gameSpy.promote).mockReturnValue(true);
        const pieceType: PieceType = PieceType.QUEEN;

        // When
        session.promote(pieceType);
        // Then
        expect(roomSpy.transmitMessage).toHaveBeenCalledTimes(1);
        expect(gameSpy.promote).toHaveBeenCalledTimes(1);
        expect(gameSpy.runTurn).toHaveBeenCalledTimes(1);
    });

    test('promote should return false on invalid move', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            transmitMessage: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const gameSpy = TestHelper.cast<SynchronousChessGame>({
            promote: vi.fn(),
            isMoveValid: vi.fn(),
            runTurn: vi.fn(),
        });
        const session: SynchronousChessOnlineHostGameSession = new SynchronousChessOnlineHostGameSession(roomSpy);
        sessionState(session).setConfiguration({ ...session.configuration(), whitePlayer: 'a' });
        sessionState(session).setConfiguration({ ...session.configuration(), blackPlayer: 'b' });
        Object.defineProperty(session, 'game', {
            value: gameSpy,
            writable: false
        });
        vi.mocked(gameSpy.promote).mockReturnValue(false);
        const pieceType: PieceType = PieceType.QUEEN;

        // When
        session.promote(pieceType);

        // Then
        expect(roomSpy.transmitMessage).toHaveBeenCalledTimes(0);
        expect(gameSpy.promote).toHaveBeenCalledTimes(1);
        expect(gameSpy.runTurn).toHaveBeenCalledTimes(0);
    });

    test('should run promote from a remote playing player', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        const runPromotionSpy = vi.fn();
        sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 });

        Object.defineProperty(session, 'runPromotion', {
            value: runPromotionSpy,
            writable: false
        });
        const pieceType: PieceType = PieceType.QUEEN;
        const message: AppMessage<SCGameSessionType.PROMOTION, PromotionMessage> = {
            from: 'a',
            type: SCGameSessionType.PROMOTION,
            payload: { pieceType }
        };
        // When
        session.onPromotion(message);

        // Then
        expect(runPromotionSpy).toHaveBeenCalledTimes(1);
    });

    test('should not run promote from a remote spectator', () => {
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'b' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        const runPromotionSpy = vi.fn();
        sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 });

        Object.defineProperty(session, 'runPromotion', {
            value: runPromotionSpy,
            writable: false
        });
        const pieceType: PieceType = PieceType.QUEEN;
        const message: AppMessage<SCGameSessionType.PROMOTION, PromotionMessage> = {
            from: 'C',
            type: SCGameSessionType.PROMOTION,
            payload: { pieceType }
        };
        // When
        session.onPromotion(message);

        // Then
        expect(runPromotionSpy).toHaveBeenCalledTimes(0);
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

    test('should ignore its own moves and promotions echoed by the room', () => {
        // Given
        const roomSpy = TestHelper.cast<Room<ChessPayloads>>({
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            localPlayer: { name: 'a' } as LocalPlayer,
        });
        vi.mocked(roomSpy.messenger).mockReturnValue(new Subject<AppMessagesOf<ChessPayloads>>());
        const session: ProtectedTest = new ProtectedTest(roomSpy);
        sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 0 });
        const runMoveSpy = vi.fn();
        const runPromotionSpy = vi.fn();
        Object.defineProperty(session, 'runMove', { value: runMoveSpy });
        Object.defineProperty(session, 'runPromotion', { value: runPromotionSpy });

        // When
        session.onMove({ from: 'a', type: SCGameSessionType.PLAY, payload: { move: null } });
        session.onPromotion({ from: 'a', type: SCGameSessionType.PROMOTION, payload: { pieceType: PieceType.QUEEN } });

        // Then
        expect(runMoveSpy).not.toHaveBeenCalled();
        expect(runPromotionSpy).not.toHaveBeenCalled();
    });
});
