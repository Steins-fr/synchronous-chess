import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessGameSessionBuilder from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session-builder';
import SynchronousChessLocalGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-local-game-session';
import { ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import SynchronousChessOnlineHostGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-host-game-session';
import SynchronousChessOnlinePeerGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-peer-game-session';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('SynchronousChessGameSessionBuilder', () => {
    let roomSpy: any; // Room<ChessPayloads>
    let initiatorGetterSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // Base spy object with method spies and player streams
        roomSpy = {
            messenger: vi.fn(),
            playerAdded$: new Subject<Player>(),
            playerRemoved$: new Subject<Player>(),
        };

        // initiator getter (value overridden in individual tests)
        initiatorGetterSpy = TestHelper.defineGetterSpy(roomSpy, 'initiator', false);

        // Sequential messenger emissions (mimics .and.returnValues)
        roomSpy.messenger
            .mockReturnValueOnce(new Subject().asObservable())
            .mockReturnValueOnce(new Subject().asObservable())
            .mockReturnValueOnce(new Subject().asObservable());
    });

    test('should create an instance of SynchronousChessOnlineHostGameSession', () => {
        initiatorGetterSpy.mockReturnValue(true);

        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomSpy as Room<ChessPayloads>);

        expect(session instanceof SynchronousChessOnlineHostGameSession).toBeTruthy();
    });

    test('should create an instance of SynchronousChessOnlinePeerGameSession', () => {
        initiatorGetterSpy.mockReturnValue(false);

        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomSpy as Room<ChessPayloads>);

        expect(session instanceof SynchronousChessOnlinePeerGameSession).toBeTruthy();
    });

    test('should create an instance of SynchronousChessOnlinePeerGameSession by default', () => {
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomSpy as Room<ChessPayloads>);

        expect(session instanceof SynchronousChessOnlinePeerGameSession).toBeTruthy();
        expect(initiatorGetterSpy).toHaveBeenCalled();
    });

    test('should create an instance of SynchronousChessLocalGameSession', () => {
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildLocal();

        expect(session instanceof SynchronousChessLocalGameSession).toBeTruthy();
    });
});
