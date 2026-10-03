import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessGameSessionBuilder from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session-builder';
import SynchronousChessLocalGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-local-game-session';
import SynchronousChessOnlineGameSession, { ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { describe, test, expect } from 'vitest';

describe('SynchronousChessGameSessionBuilder', () => {
    test('should create the same online session for the host and the other participants', () => {
        // Given
        const room: Room<ChessPayloads> = TestHelper.cast<Room<ChessPayloads>>({ messenger: () => new Subject() });

        // When
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(room);

        // Then
        expect(session instanceof SynchronousChessOnlineGameSession).toBeTruthy();
    });

    test('should create an instance of SynchronousChessLocalGameSession', () => {
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildLocal();

        expect(session instanceof SynchronousChessLocalGameSession).toBeTruthy();
    });
});
