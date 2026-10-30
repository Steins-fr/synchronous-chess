import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SynchronousChess } from './synchronous-chess';
import { SCGameSessionType } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { ChatMessengerType } from '@app/modules/chat-page/components/chat/chat.component';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { answerOpenRooms, TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { TestHelper } from '@testing/test.helper';
import { RoomGame } from '@protocol/room-game.enum';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('SynchronousChess', () => {
    let fixture: ComponentFixture<SynchronousChess>;
    let roomManagerService: RoomManagerService;
    let room: Room<object>;

    beforeEach(async () => {
        Element.prototype.scrollTo ??= (): void => undefined;
        // A room without cheat report
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), new RoomNetworkMock().roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });

        await TestBed.configureTestingModule({
            imports: [SynchronousChess],
            // Provided by the config of the app
            providers: [{ provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER }, { provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }],
        })
            // Provided by the page itself, so override it rather than providing it to the testing module
            .overrideProvider(RoomManagerService, { useValue: roomManagerService })
            .compileComponents();

        fixture = TestBed.createComponent(SynchronousChess);
        answerOpenRooms();
        await fixture.whenStable();
    });

    test('should present the game and its rules until the room is setup', () => {
        expect(fixture.nativeElement.querySelector('app-chess-presentation')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-chess-rules .title')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('details.rules-details')).toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-sync-chess-game')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-chat')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-room-history')).toBeNull();
    });

    test('should build the room once setup', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);

        // When
        roomSetupService.setup({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'local', token: 'token' });
        await vi.waitFor(() => expect(roomManagerService.buildBlockRoom).toHaveBeenCalled());
        await fixture.whenStable();

        // Then
        expect(roomManagerService.buildBlockRoom).toHaveBeenCalledWith({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'local', token: 'token' }, 4, {
            [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT,
            [ChatMessengerType.MODERATION]: BlockChainName.CHAT,
            [SCGameSessionType.SEAT]: BlockChainName.CHESS,
            [SCGameSessionType.COMMIT]: BlockChainName.CHESS,
            [SCGameSessionType.REVEAL]: BlockChainName.CHESS,
            [SCGameSessionType.UNSEAT]: BlockChainName.CHESS,
            [SCGameSessionType.FORFEIT]: BlockChainName.CHESS,
        }, expect.any(AbortSignal));
        await vi.waitFor(() => expect(fixture.nativeElement.querySelector('app-sync-chess-game')).not.toBeNull());

        // Then the game replaces the presentation, the rules are folded below it, without their own title
        roomSetupService.roomIsSetup(true);
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('app-chess-presentation')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-sync-chess-game')).not.toBeNull();
        // The chat beside the game, out of the page
        expect(fixture.nativeElement.querySelector('#room-chat app-chat')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#page-content app-chat')).toBeNull();
        // The moves of the game beside it too, out of the page
        expect(fixture.nativeElement.querySelector('#room-history app-room-history')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#page-content app-room-history')).toBeNull();
        expect(fixture.nativeElement.querySelector('details.rules-details:not([open]) app-chess-rules')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-chess-rules .title')).toBeNull();
        // The debug panel of WebRTC out of the page: the room layout offers it
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).toBeNull();

        // When
        const clearSpy = vi.spyOn(room, 'clear');
        fixture.destroy();

        // Then
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    test('should make the setup form available again when the room can not be built', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(new Error('Already in game'));
        const loading: boolean[] = [];
        roomSetupService.loading$.subscribe((value: boolean) => loading.push(value));

        // When
        roomSetupService.setup({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'local', token: 'token' });

        // Then
        await vi.waitFor(() => expect(loading).toEqual([false, true, false]));
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('app-sync-chess-game')).toBeNull();
    });

    test('should be destroyed without room', () => {
        expect(() => fixture.destroy()).not.toThrow();
    });
});
