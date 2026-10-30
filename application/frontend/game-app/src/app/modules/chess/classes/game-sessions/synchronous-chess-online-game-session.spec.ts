import SynchronousChessOnlineGameSession, {
    ChessPayloads,
    CommitMessage,
    RevealMessage,
    SCGameSessionType,
    SealedAction,
    SealedActionKind
} from './synchronous-chess-online-game-session';
import { SealedTurnStore } from './sealed-turn-store';
import { SessionConfiguration } from './synchronous-chess-game-session';
import PromotionTurn from '../turns/promotion-turn';
import SyncTurn from '../turns/sync-turn';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';
import Move, { FenColumn, FenRow } from '../../interfaces/move';
import ChessBoardHelper from '../../helpers/chess-board-helper';
import { WritableSignal } from '@angular/core';
import { Room } from '@app/services/room-manager/classes/room/room';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { gameState, sessionState } from '@testing/chess-state.helper';
import { RoomHub } from '@testing/room-hub';
import { GameEndReason, GameResult } from '../games/game-result';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const e2e4: Move = { from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._4] };
const e7e5: Move = { from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] };
const d2d4: Move = { from: [FenColumn.D, FenRow._2], to: [FenColumn.D, FenRow._4] };

function turnCount(session: SynchronousChessOnlineGameSession): number {
    return TestHelper.cast<{ turnCount: number }>(session).turnCount;
}

function promotionOfWhite(session: SynchronousChessOnlineGameSession): void {
    gameState(session.game)._turn.set(new PromotionTurn({
        whiteFenCoordinate: [FenColumn.A, FenRow._8],
        blackFenCoordinate: null,
        whitePiece: null,
        blackPiece: null,
    }, new SyncTurn()));
}

function configure(session: SynchronousChessOnlineGameSession): void {
    sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b' });
}

describe('SynchronousChessOnlineGameSession', () => {
    let hub: RoomHub<ChessPayloads>;
    let white: SynchronousChessOnlineGameSession;
    let black: SynchronousChessOnlineGameSession;
    let spectator: SynchronousChessOnlineGameSession;
    let sessions: SynchronousChessOnlineGameSession[];

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<ChessPayloads>();
        white = new SynchronousChessOnlineGameSession(hub.room('a'));
        black = new SynchronousChessOnlineGameSession(hub.room('b'));
        spectator = new SynchronousChessOnlineGameSession(hub.room('c'));
        sessions = [white, black, spectator];
        sessions.forEach(configure);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** A message of a player, as a cheating client would send it */
    async function sealed(from: string, color: PieceColor, action: SealedAction, options: { turn?: number; revealedTurn?: number; revealedAction?: SealedAction } = {}): Promise<void> {
        const { turn = 0, revealedTurn = turn, revealedAction = action } = options;
        const commit: CommitMessage = { turn, commitment: await SynchronousChessOnlineGameSession.commitment(turn, color, action, 'salt') };
        const reveal: RevealMessage = { turn: revealedTurn, action: revealedAction, salt: 'salt' };
        hub.send({ from, type: SCGameSessionType.COMMIT, payload: commit });
        hub.send({ from, type: SCGameSessionType.REVEAL, payload: reveal });
    }

    test('should let each seated player play its color once, until the next turn', () => {
        // Then
        expect(white.playingColor).toEqual(PieceColor.WHITE);
        expect(black.playingColor).toEqual(PieceColor.BLACK);
        expect(spectator.playingColor).toEqual(PieceColor.NONE);

        // When
        white.move(e2e4);

        // Then
        expect(white.playingColor).toEqual(PieceColor.NONE);
        expect(black.playingColor).toEqual(PieceColor.BLACK);
    });

    test('should let no one play once the game ended', () => {
        // When
        gameState(white.game)._result.set({ winner: PieceColor.NONE, reason: GameEndReason.STALEMATE });

        // Then
        expect(white.playingColor).toEqual(PieceColor.NONE);
    });

    test('should hide the move of a player until the other one is committed', async () => {
        // When
        white.move(e2e4);

        // Then only a commitment is sent, the move of white stays unknown
        await vi.waitFor(() => expect(hub.types()).toEqual([SCGameSessionType.COMMIT]));
        expect(black.game.colorHasPlayed(PieceColor.WHITE)).toEqual(false);
        expect(white.game.colorHasPlayed(PieceColor.WHITE)).toEqual(true);

        // When
        black.move(e7e5);

        // Then both reveal, and every participant runs the same turn
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        expect(hub.types()).toEqual([SCGameSessionType.COMMIT, SCGameSessionType.COMMIT, SCGameSessionType.REVEAL, SCGameSessionType.REVEAL]);
        expect(black.board()).toEqual(white.board());
        expect(spectator.board()).toEqual(white.board());
        expect(white.board()).not.toEqual(ChessBoardHelper.createFenBoard());
        expect(hub.reports).toEqual([]);
    });

    test('should play the promotions the same way, revealing at once a turn played alone', async () => {
        // Given a promotion of white only
        sessions.forEach(promotionOfWhite);

        // When
        white.promote(PieceType.QUEEN);

        // Then
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        expect(hub.types()).toEqual([SCGameSessionType.COMMIT, SCGameSessionType.REVEAL]);
        expect(spectator.board()).toEqual(white.board());
        expect(hub.reports).toEqual([]);
    });

    test('should reveal a turn played alone, after the next turn is played', async () => {
        // Given a promotion of white only, followed by a turn of both players
        sessions.forEach(promotionOfWhite);

        // When white plays both turns before its commitments are in the chain
        white.promote(PieceType.QUEEN);
        white.move(e2e4);
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        black.move(e7e5);

        // Then
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([2, 2, 2]));
        expect(black.board()).toEqual(white.board());
        expect(spectator.board()).toEqual(white.board());
        expect(hub.reports).toEqual([]);
    });

    /** White reloads the page: a new session, to which the chain delivers again its messages */
    function reloadWhite(messages?: ReadonlyArray<AppMessage>, prepare: (session: SynchronousChessOnlineGameSession) => void = () => undefined): SynchronousChessOnlineGameSession {
        white.destroy();
        const room: Room<ChessPayloads> = hub.room('a');
        const reloaded: SynchronousChessOnlineGameSession = new SynchronousChessOnlineGameSession(room);
        configure(reloaded);
        prepare(reloaded);
        hub.replay(room, messages);
        return reloaded;
    }

    function delivered(type: SCGameSessionType, turn: number): AppMessage {
        return hub.delivered.find((message: AppMessage) => message.from === 'a' && message.type === type && TestHelper.cast<CommitMessage>(message.payload).turn === turn) as AppMessage;
    }

    test('should replay its own moves once the page is reloaded', async () => {
        // Given a turn played, and an action of a previous game in a room of the same name
        white.move(e2e4);
        black.move(e7e5);
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        new SealedTurnStore('room', 'a').save({ turn: 0, colors: [PieceColor.WHITE, PieceColor.BLACK], action: { kind: SealedActionKind.MOVE, move: d2d4 }, salt: 'previous game' });

        // When
        const reloaded: SynchronousChessOnlineGameSession = reloadWhite();

        // Then
        await vi.waitFor(() => expect(turnCount(reloaded)).toEqual(1));
        expect(reloaded.board()).toEqual(black.board());
        // The history of the game rebuilt by the replay of the chain
        expect(reloaded.game.playedTurns()).toHaveLength(1);
        expect(reloaded.game.playedTurns()).toEqual(black.game.playedTurns());
        expect(hub.reports).toEqual([]);

        // When it plays the next turn
        reloaded.move(d2d4);

        // Then
        await vi.waitFor(() => expect(hub.delivered.at(-1)).toEqual(expect.objectContaining({ from: 'a', type: SCGameSessionType.COMMIT, payload: expect.objectContaining({ turn: 1 }) })));
    });

    test('should reveal after a reload the action committed to before', async () => {
        // Given white committed, black did not play yet
        white.move(e2e4);
        await vi.waitFor(() => expect(hub.types()).toEqual([SCGameSessionType.COMMIT]));

        // When
        const reloaded: SynchronousChessOnlineGameSession = reloadWhite();

        // Then white plays its stored action again, without committing again
        await vi.waitFor(() => expect(reloaded.game.colorHasPlayed(PieceColor.WHITE)).toEqual(true));
        expect(hub.types()).toEqual([SCGameSessionType.COMMIT]);

        // When
        black.move(e7e5);

        // Then
        await vi.waitFor(() => expect([reloaded, black, spectator].map(turnCount)).toEqual([1, 1, 1]));
        expect(black.board()).toEqual(reloaded.board());
        expect(spectator.board()).toEqual(reloaded.board());
        expect(hub.reports).toEqual([]);
        expect(new SealedTurnStore('room', 'a').get(0)).toBeUndefined();
    });

    test('should play a restored action once the game reaches its turn', async () => {
        // Given white played a promotion alone, revealed it, then committed to the next turn
        sessions.forEach(promotionOfWhite);
        white.promote(PieceType.QUEEN);
        white.move(e2e4);
        await vi.waitFor(() => expect(hub.types()).toHaveLength(3));

        // When white reloads, the chain having ordered its second commitment before its reveal
        const reloaded: SynchronousChessOnlineGameSession = reloadWhite([
            delivered(SCGameSessionType.COMMIT, 0),
            delivered(SCGameSessionType.COMMIT, 1),
            delivered(SCGameSessionType.REVEAL, 0),
        ], promotionOfWhite);

        // Then
        await vi.waitFor(() => expect(reloaded.game.colorHasPlayed(PieceColor.WHITE)).toEqual(true));
        expect(turnCount(reloaded)).toEqual(1);

        // When
        black.move(e7e5);

        // Then
        await vi.waitFor(() => expect([reloaded, black, spectator].map(turnCount)).toEqual([2, 2, 2]));
        expect(black.board()).toEqual(reloaded.board());
        expect(reloaded.game.playedTurns()).toHaveLength(2);
        expect(reloaded.game.playedTurns()).toEqual(black.game.playedTurns());
        expect(spectator.game.playedTurns()).toEqual(black.game.playedTurns());
        expect(hub.reports).toEqual([]);
    });

    test('should ignore a reveal sent again, by a player who reloaded the page', async () => {
        // Given
        const whiteAction: SealedAction = { kind: SealedActionKind.MOVE, move: e2e4 };
        const blackAction: SealedAction = { kind: SealedActionKind.MOVE, move: e7e5 };
        const whiteReveal: AppMessage = { from: 'a', type: SCGameSessionType.REVEAL, payload: { turn: 0, action: whiteAction, salt: 'salt' } };
        hub.send({ from: 'a', type: SCGameSessionType.COMMIT, payload: { turn: 0, commitment: await SynchronousChessOnlineGameSession.commitment(0, PieceColor.WHITE, whiteAction, 'salt') } });
        hub.send({ from: 'b', type: SCGameSessionType.COMMIT, payload: { turn: 0, commitment: await SynchronousChessOnlineGameSession.commitment(0, PieceColor.BLACK, blackAction, 'salt') } });

        // When white reveals again during the turn, then once it is run
        hub.send(whiteReveal);
        hub.send(whiteReveal);
        hub.send({ from: 'b', type: SCGameSessionType.REVEAL, payload: { turn: 0, action: blackAction, salt: 'salt' } });
        hub.send(whiteReveal);

        // Then
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(hub.reports).toEqual([]);
    });

    test('should go on with the next reveals after a malformed one', async () => {
        // Given
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);

        // When
        hub.send({ from: 'b', type: SCGameSessionType.REVEAL, payload: null });
        white.move(e2e4);
        black.move(e7e5);

        // Then
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        expect(TimedLogger.error).toHaveBeenCalledWith(`Failed to handle ${ SCGameSessionType.REVEAL } from b`, expect.any(TypeError));
    });

    test('should not commit a move refused by the rules, nor the moves of a spectator', () => {
        // When
        white.move({ from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._5] });
        spectator.move(e7e5);

        // Then
        expect(hub.delivered).toEqual([]);
    });

    test('should keep the first commitment of a player for a turn', async () => {
        // Given white sends a commitment, then another one
        hub.send({ from: 'a', type: SCGameSessionType.COMMIT, payload: { turn: 0, commitment: 'first' } });
        white.move(e2e4);
        await vi.waitFor(() => expect(hub.types()).toEqual([SCGameSessionType.COMMIT, SCGameSessionType.COMMIT]));

        // When
        black.move(e7e5);

        // Then the move of white does not match its first commitment
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason]).sort()).toEqual([
            ['b', CheatReason.INVALID_REVEAL],
            ['c', CheatReason.INVALID_REVEAL],
        ]));
        expect(turnCount(black)).toEqual(0);
    });

    test('should refuse a reveal not matching its commitment, or of another turn', async () => {
        // When
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: e2e4 }, { revealedAction: { kind: SealedActionKind.MOVE, move: { ...e2e4, to: [FenColumn.E, FenRow._3] } } });
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: e2e4 }, { turn: 1 });

        // Then every participant reports both, the session of white not having played them
        await vi.waitFor(() => expect(hub.reports).toHaveLength(6));
        expect(hub.reports.every(([, , reason]) => reason === CheatReason.INVALID_REVEAL)).toEqual(true);
        expect(black.game.colorHasPlayed(PieceColor.WHITE)).toEqual(false);
    });

    test('should report the revealed moves against the rules', async () => {
        // When
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: { from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._5] } });
        // A synchronous turn can not be skipped, the game throws on it
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: null }, { turn: 0 });

        // Then
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason]).sort()).toEqual([
            ['a', CheatReason.ILLEGAL_MOVE],
            ['a', CheatReason.INVALID_REVEAL],
            ['b', CheatReason.ILLEGAL_MOVE],
            ['b', CheatReason.INVALID_REVEAL],
            ['c', CheatReason.ILLEGAL_MOVE],
            ['c', CheatReason.INVALID_REVEAL],
        ]));
        expect(spectator.board()).toEqual(ChessBoardHelper.createFenBoard());
    });

    test('should report a revealed action the game throws on', async () => {
        // Given a player who revealed nothing yet
        await sealed('b', PieceColor.BLACK, { kind: SealedActionKind.MOVE, move: null });

        // Then
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason]).sort()).toEqual([
            ['a', CheatReason.ILLEGAL_MOVE],
            ['b', CheatReason.ILLEGAL_MOVE],
            ['c', CheatReason.ILLEGAL_MOVE],
        ]));
    });

    test('should report a revealed promotion to a piece a pawn can not become', async () => {
        // Given a promotion of white only
        sessions.forEach(promotionOfWhite);

        // When
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.PROMOTION, pieceType: PieceType.KING });

        // Then
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason]).sort()).toEqual([
            ['a', CheatReason.ILLEGAL_MOVE],
            ['b', CheatReason.ILLEGAL_MOVE],
            ['c', CheatReason.ILLEGAL_MOVE],
        ]));
        expect(spectator.game.playedTurns()).toEqual([]);
    });

    test('should ignore the commitments and reveals of the spectators', async () => {
        // When
        await sealed('c', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: e2e4 });

        // Then
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(hub.reports).toEqual([]);
        expect(white.game.colorHasPlayed(PieceColor.WHITE)).toEqual(false);
    });
});

describe('SynchronousChessOnlineGameSession seats', () => {
    let hub: RoomHub<ChessPayloads>;
    let host: SynchronousChessOnlineGameSession;
    let joining: SynchronousChessOnlineGameSession;
    let other: SynchronousChessOnlineGameSession;
    let sessions: SynchronousChessOnlineGameSession[];
    let rooms: Map<string, Room<ChessPayloads>>;

    /** The page of a participant */
    function page(name: string): SynchronousChessOnlineGameSession {
        const room: Room<ChessPayloads> = hub.room(name);
        rooms.set(name, room);
        return new SynchronousChessOnlineGameSession(room);
    }

    /** The participant leaves the room: the other pages see it away */
    function leave(name: string): void {
        hub.leave(rooms.get(name) as Room<ChessPayloads>);
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<ChessPayloads>();
        rooms = new Map();
        host = page('a');
        joining = page('b');
        other = page('c');
        sessions = [host, joining, other];
    });

    function configurations(): SessionConfiguration[] {
        return sessions.map((session: SynchronousChessOnlineGameSession) => session.configuration());
    }

    test('should start with free seats, every participant being a spectator', () => {
        // Then
        expect(configurations()).toEqual([{}, {}, {}]);
        expect(sessions.map((session) => session.spectatorNumber())).toEqual([3, 3, 3]);
        expect(sessions.every((session) => session.seatsOpen())).toEqual(true);
        expect(sessions.some((session) => session.inMatch())).toEqual(false);
        expect(host.playingColor).toEqual(PieceColor.NONE);
    });

    test('should seat the participants taking a free seat, the host included', () => {
        // When
        host.takeSeat(PieceColor.BLACK);
        joining.takeSeat(PieceColor.WHITE);

        // Then every participant seats the same players
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: 'b', blackPlayer: 'a' }));
        expect(sessions.map((session) => session.spectatorNumber())).toEqual([1, 1, 1]);
        expect(host.myColor).toEqual(PieceColor.BLACK);
        expect(host.playingColor).toEqual(PieceColor.BLACK);
        expect(joining.playingColor).toEqual(PieceColor.WHITE);
        expect(other.playingColor).toEqual(PieceColor.NONE);
    });

    test('should not play before both seats are taken', () => {
        // Given
        host.takeSeat(PieceColor.WHITE);

        // When
        host.move(e2e4);

        // Then
        expect(host.playingColor).toEqual(PieceColor.NONE);
        expect(hub.types()).toEqual([SCGameSessionType.SEAT]);
    });

    test('should give a seat to the first request ordered in the chain', () => {
        // When both request the same seat
        joining.takeSeat(PieceColor.WHITE);
        other.takeSeat(PieceColor.WHITE);

        // Then
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: 'b', blackPlayer: undefined }));
    });

    test('should move a player to the other seat, or out of its seat', () => {
        // When
        host.takeSeat(PieceColor.WHITE);
        host.takeSeat(PieceColor.BLACK);

        // Then
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: undefined, blackPlayer: 'a' }));

        // When
        host.leaveSeat();

        // Then
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: undefined, blackPlayer: undefined }));
        expect(host.spectatorNumber()).toEqual(3);
    });

    test('should keep its seat to a player requesting a taken seat', () => {
        // Given
        host.takeSeat(PieceColor.BLACK);
        joining.takeSeat(PieceColor.WHITE);

        // When
        joining.takeSeat(PieceColor.BLACK);

        // Then
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: 'b', blackPlayer: 'a' }));
    });

    test('should keep the seats once a player committed to its first action', async () => {
        // Given
        host.takeSeat(PieceColor.WHITE);
        joining.takeSeat(PieceColor.BLACK);

        // When
        host.move(e2e4);
        await vi.waitFor(() => expect(sessions.every((session) => !session.seatsOpen())).toEqual(true));
        joining.leaveSeat();
        other.takeSeat(PieceColor.BLACK);

        // Then
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: 'a', blackPlayer: 'b' }));
    });

    test('should tell the players, not the spectators, they play the game once started, until over', async () => {
        // Given
        host.takeSeat(PieceColor.WHITE);
        joining.takeSeat(PieceColor.BLACK);

        // Then: not started yet
        expect(sessions.map((session) => session.inMatch())).toEqual([false, false, false]);

        // When
        host.move(e2e4);
        await vi.waitFor(() => expect(sessions.every((session) => !session.seatsOpen())).toEqual(true));

        // Then
        expect(sessions.map((session) => session.inMatch())).toEqual([true, true, false]);

        // When
        TestHelper.cast<{ _result: WritableSignal<GameResult | null> }>(host.game)._result.set({ winner: PieceColor.WHITE, reason: GameEndReason.CHECKMATE });

        // Then
        expect(host.inMatch()).toEqual(false);
    });

    test('should ignore a malformed seat request', () => {
        // Given
        other.takeSeat(PieceColor.WHITE);

        // When
        hub.send({ from: 'c', type: SCGameSessionType.SEAT, payload: { color: 'red' } });

        // Then
        expect(configurations()).toEqual(Array(3).fill({ whitePlayer: 'c', blackPlayer: undefined }));
    });

    test('should let the other seated player or the host free the seat of a player away, before the game starts', () => {
        // Given: a hosts the room, b and c play, d watches
        hub.sequencer.set('a');
        const spectator: SynchronousChessOnlineGameSession = page('d');
        joining.takeSeat(PieceColor.WHITE);
        other.takeSeat(PieceColor.BLACK);
        expect(other.awayPlayers()).toEqual([]);
        expect(other.canRelease(PieceColor.WHITE)).toEqual(false);

        // When b leaves the room
        leave('b');

        // Then
        expect(other.awayPlayers()).toEqual(['b']);
        expect([other.canRelease(PieceColor.WHITE), other.canRelease(PieceColor.BLACK)]).toEqual([true, false]);
        expect([host.canRelease(PieceColor.WHITE), spectator.canRelease(PieceColor.WHITE)]).toEqual([true, false]);

        // When the spectator frees the seat, then c, its request waiting for the chain
        spectator.release(PieceColor.WHITE);
        hub.hold('c');
        other.release(PieceColor.WHITE);

        // Then
        expect(spectator.configuration()).toEqual({ whitePlayer: 'b', blackPlayer: 'c' });
        expect(other.canRelease(PieceColor.WHITE)).toEqual(false);

        // When
        hub.release();

        // Then
        expect([host, other, spectator].map((session) => session.configuration())).toEqual(Array(3).fill({ whitePlayer: undefined, blackPlayer: 'c' }));
        expect(other.canRelease(PieceColor.WHITE)).toEqual(false);

        // When c leaves too, then the host frees its seat
        leave('c');
        host.release(PieceColor.BLACK);

        // Then
        expect(spectator.configuration()).toEqual({ whitePlayer: undefined, blackPlayer: undefined });
        expect(hub.types().filter((type: string) => type === SCGameSessionType.UNSEAT)).toHaveLength(3);
    });

    test('should free no seat once the game started, of another player, of a malformed color, nor from a participant not ordering its request', async () => {
        // Given
        hub.sequencer.set('a');
        const spectator: SynchronousChessOnlineGameSession = page('d');
        joining.takeSeat(PieceColor.WHITE);
        other.takeSeat(PieceColor.BLACK);
        leave('b');

        // When
        hub.send({ from: 'a', type: SCGameSessionType.UNSEAT, payload: { color: TestHelper.cast<PieceColor>('red'), name: 'b' } });
        hub.send({ from: 'c', type: SCGameSessionType.UNSEAT, payload: { color: PieceColor.WHITE, name: 'd' } });
        hub.send({ from: 'd', type: SCGameSessionType.UNSEAT, payload: { color: PieceColor.WHITE, name: 'b' } });
        hub.sequencer.set('c');
        hub.send({ from: 'a', type: SCGameSessionType.UNSEAT, payload: { color: PieceColor.WHITE, name: 'b' } });

        // Then
        expect(spectator.configuration()).toEqual({ whitePlayer: 'b', blackPlayer: 'c' });

        // When the game starts, then c frees the seat of b
        other.move(e7e5);
        await vi.waitFor(() => expect(spectator.seatsOpen()).toEqual(false));
        hub.send({ from: 'c', type: SCGameSessionType.UNSEAT, payload: { color: PieceColor.WHITE, name: 'b' } });

        // Then
        expect(spectator.configuration()).toEqual({ whitePlayer: 'b', blackPlayer: 'c' });
        expect(other.canRelease(PieceColor.WHITE)).toEqual(false);
    });

    test('should free the seat the host freed alike on a page replaying the chain after a handover', () => {
        // Given: a, the host, frees the seat of b
        hub.sequencer.set('a');
        joining.takeSeat(PieceColor.WHITE);
        other.takeSeat(PieceColor.BLACK);
        leave('b');
        host.release(PieceColor.WHITE);

        // When c orders the chain since, and d joins late
        hub.sequencer.set('c');
        const late: SynchronousChessOnlineGameSession = page('d');
        hub.replay(rooms.get('d') as Room<ChessPayloads>);

        // Then
        expect(late.configuration()).toEqual({ whitePlayer: undefined, blackPlayer: 'c' });

        // When d takes the seat then leaves, a, no longer the host, frees it
        late.takeSeat(PieceColor.WHITE);
        leave('d');
        host.release(PieceColor.WHITE);

        // Then
        expect(host.canRelease(PieceColor.WHITE)).toEqual(false);
        expect(other.configuration()).toEqual({ whitePlayer: 'd', blackPlayer: 'c' });
    });

    test('should seat the players again when the chain is replayed after a reload', () => {
        // Given
        host.takeSeat(PieceColor.WHITE);
        joining.takeSeat(PieceColor.BLACK);

        // When the host reloads the page
        host.destroy();
        const room: Room<ChessPayloads> = hub.room('a');
        const reloaded: SynchronousChessOnlineGameSession = new SynchronousChessOnlineGameSession(room);
        hub.replay(room);

        // Then
        expect(reloaded.configuration()).toEqual({ whitePlayer: 'a', blackPlayer: 'b' });
        expect(reloaded.playingColor).toEqual(PieceColor.WHITE);
    });
});
