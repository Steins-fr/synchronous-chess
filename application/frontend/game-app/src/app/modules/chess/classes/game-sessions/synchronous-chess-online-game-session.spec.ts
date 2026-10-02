import SynchronousChessOnlineGameSession, {
    ChessPayloads,
    CommitMessage,
    RevealMessage,
    SCGameSessionType,
    SealedAction,
    SealedActionKind
} from './synchronous-chess-online-game-session';
import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
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
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { gameState, sessionState } from '@testing/chess-state.helper';
import { TestHelper } from '@testing/test.helper';
import { filter, Subject } from 'rxjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const e2e4: Move = { from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._4] };
const e7e5: Move = { from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] };

/** Delivers the messages of the players to all of them, in a single order, as the sequencer of a block chain does */
class RoomHub {
    public readonly delivered: AppMessage[] = [];
    public readonly reports: Array<[string, AppMessage, CheatReason]> = [];
    private readonly messages = new Subject<AppMessage>();
    private readonly queue: AppMessage[] = [];
    private delivering: boolean = false;

    public room(name: string): Room<ChessPayloads> {
        return TestHelper.cast<Room<ChessPayloads>>({
            localPlayer: { name },
            hostName: 'a',
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
            messenger: (type: string) => this.messages.pipe(filter((message: AppMessage) => message.type === type)),
            transmitMessage: (type: string, payload: unknown) => this.send({ from: name, type, payload }),
            reportCheat: (message: AppMessage, reason: CheatReason) => this.reports.push([name, message, reason]),
        });
    }

    public send(message: AppMessage): void {
        this.queue.push(message);

        if (this.delivering) {
            return;
        }

        this.delivering = true;
        for (let next = this.queue.shift(); next; next = this.queue.shift()) {
            this.delivered.push(next);
            this.messages.next(next);
        }
        this.delivering = false;
    }

    public types(): string[] {
        return this.delivered.map((message: AppMessage) => message.type);
    }
}

function turnCount(session: SynchronousChessOnlineGameSession): number {
    return TestHelper.cast<{ turnCount: number }>(session).turnCount;
}

describe('SynchronousChessOnlineGameSession', () => {
    let hub: RoomHub;
    let white: SynchronousChessOnlineGameSession;
    let black: SynchronousChessOnlineGameSession;
    let spectator: SynchronousChessOnlineGameSession;
    let sessions: SynchronousChessOnlineGameSession[];

    beforeEach(() => {
        hub = new RoomHub();
        white = new SynchronousChessOnlineHostGameSession(hub.room('a'));
        black = new SynchronousChessOnlinePeerGameSession(hub.room('b'));
        spectator = new SynchronousChessOnlinePeerGameSession(hub.room('c'));
        sessions = [white, black, spectator];
        sessions.forEach((session: SynchronousChessOnlineGameSession) => sessionState(session).setConfiguration({ whitePlayer: 'a', blackPlayer: 'b', spectatorNumber: 1 }));
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
        sessions.forEach((session: SynchronousChessOnlineGameSession) => gameState(session.game)._turn.set(new PromotionTurn({
            whiteFenCoordinate: [FenColumn.A, FenRow._8],
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null,
        }, new SyncTurn())));

        // When
        white.promote(PieceType.QUEEN);

        // Then
        await vi.waitFor(() => expect(sessions.map(turnCount)).toEqual([1, 1, 1]));
        expect(hub.types()).toEqual([SCGameSessionType.COMMIT, SCGameSessionType.REVEAL]);
        expect(spectator.board()).toEqual(white.board());
        expect(hub.reports).toEqual([]);
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

        // Then the other participants report both
        await vi.waitFor(() => expect(hub.reports).toHaveLength(4));
        expect(hub.reports.every(([, , reason]) => reason === CheatReason.INVALID_REVEAL)).toEqual(true);
        expect(black.game.colorHasPlayed(PieceColor.WHITE)).toEqual(false);
    });

    test('should report the revealed moves against the rules', async () => {
        // When
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: { from: [FenColumn.E, FenRow._2], to: [FenColumn.E, FenRow._5] } });
        // A synchronous turn can not be skipped, the game throws on it
        await sealed('a', PieceColor.WHITE, { kind: SealedActionKind.MOVE, move: null }, { turn: 0 });

        // Then
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason])).toEqual([
            ['b', CheatReason.ILLEGAL_MOVE],
            ['c', CheatReason.ILLEGAL_MOVE],
            ['b', CheatReason.INVALID_REVEAL],
            ['c', CheatReason.INVALID_REVEAL],
        ]));
        expect(spectator.board()).toEqual(ChessBoardHelper.createFenBoard());
    });

    test('should report a revealed action the game throws on', async () => {
        // Given a player who revealed nothing yet
        await sealed('b', PieceColor.BLACK, { kind: SealedActionKind.MOVE, move: null });

        // Then
        await vi.waitFor(() => expect(hub.reports.map(([reporter, , reason]) => [reporter, reason])).toEqual([
            ['a', CheatReason.ILLEGAL_MOVE],
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
