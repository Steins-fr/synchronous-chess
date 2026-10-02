import SynchronousChessOnlineGameSession, {
    ChessPayloads,
    CommitMessage,
    RevealMessage,
    SCGameSessionType,
    SealedAction,
    SealedActionKind
} from './synchronous-chess-online-game-session';
import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
import { SealedTurnStore } from './sealed-turn-store';
import SynchronousChessOnlinePeerGameSession from './synchronous-chess-online-peer-game-session';
import PromotionTurn from '../turns/promotion-turn';
import SyncTurn from '../turns/sync-turn';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';
import Move, { FenColumn, FenRow } from '../../interfaces/move';
import ChessBoardHelper from '../../helpers/chess-board-helper';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { gameState, sessionState } from '@testing/chess-state.helper';
import { TestHelper } from '@testing/test.helper';
import { filter, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const e2e4: Move = { from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._4] };
const e7e5: Move = { from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] };
const d2d4: Move = { from: [FenColumn.D, FenRow._2], to: [FenColumn.D, FenRow._4] };

/** Delivers the messages of the players to all of them, in a single order, as the sequencer of a block chain does */
class RoomHub {
    public readonly delivered: AppMessage[] = [];
    public readonly reports: Array<[string, AppMessage, CheatReason]> = [];
    private readonly rooms = new Map<Room<ChessPayloads>, Subject<AppMessage>>();
    private readonly queue: AppMessage[] = [];
    private delivering: boolean = false;

    public room(name: string): Room<ChessPayloads> {
        const messages = new Subject<AppMessage>();
        const room: Room<ChessPayloads> = TestHelper.cast<Room<ChessPayloads>>({
            localPlayer: { name },
            hostName: 'a',
            roomName: 'room',
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            messenger: (type: string) => messages.pipe(filter((message: AppMessage) => message.type === type)),
            transmitMessage: (type: string, payload: unknown) => this.send({ from: name, type, payload }),
            reportCheat: (message: AppMessage, reason: CheatReason) => this.reports.push([name, message, reason]),
        });
        this.rooms.set(room, messages);
        return room;
    }

    public send(message: AppMessage): void {
        this.queue.push(message);

        if (this.delivering) {
            return;
        }

        this.delivering = true;
        for (let next = this.queue.shift(); next; next = this.queue.shift()) {
            this.delivered.push(next);
            this.rooms.forEach((messages: Subject<AppMessage>) => messages.next(next));
        }
        this.delivering = false;
    }

    /** Delivers again messages of the chain to a room only, as when a player reloads the page */
    public replay(room: Room<ChessPayloads>, messages: ReadonlyArray<AppMessage> = [...this.delivered]): void {
        messages.forEach((message: AppMessage) => this.rooms.get(room)?.next(message));
    }

    public types(): string[] {
        return this.delivered.map((message: AppMessage) => message.type);
    }
}

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
    sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 1 });
}

describe('SynchronousChessOnlineGameSession', () => {
    let hub: RoomHub;
    let white: SynchronousChessOnlineGameSession;
    let black: SynchronousChessOnlineGameSession;
    let spectator: SynchronousChessOnlineGameSession;
    let sessions: SynchronousChessOnlineGameSession[];

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub();
        white = new SynchronousChessOnlineHostGameSession(hub.room('a'));
        black = new SynchronousChessOnlinePeerGameSession(hub.room('b'));
        spectator = new SynchronousChessOnlinePeerGameSession(hub.room('c'));
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
        const reloaded: SynchronousChessOnlineGameSession = new SynchronousChessOnlineHostGameSession(room);
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
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason])).toEqual([
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

    test('should ignore the commitments and reveals of the spectators', async () => {
        // When
        await sealed('c', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: e2e4 });

        // Then
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(hub.reports).toEqual([]);
        expect(white.game.colorHasPlayed(PieceColor.WHITE)).toEqual(false);
    });
});
