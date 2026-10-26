import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatPage } from './chat.page';
import { ChatMessengerType } from './components/chat/chat.component';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { JoinFailure } from '@app/services/room-manager/classes/room-network/room-network';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { answerOpenRooms, TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { TestHelper } from '@testing/test.helper';
import { RoomGame } from '@protocol/room-game.enum';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('ChatPage', () => {
    let fixture: ComponentFixture<ChatPage>;
    let roomManagerService: RoomManagerService;
    let room: Room<object>;

    beforeEach(async () => {
        Element.prototype.scrollTo ??= (): void => undefined;
        // A room without cheat report
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), new RoomNetworkMock().roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });

        await TestBed.configureTestingModule({
            imports: [ChatPage],
            // Provided by the config of the app
            providers: [{ provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER }, { provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }],
        })
            // Provided by the page itself, so override it rather than providing it to the testing module
            .overrideProvider(RoomManagerService, { useValue: roomManagerService })
            .compileComponents();

        fixture = TestBed.createComponent(ChatPage);
        answerOpenRooms();
        await fixture.whenStable();
    });

    test('should wait for the room setup', () => {
        expect(fixture.nativeElement.querySelector('app-chat')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).not.toBeNull();
    });

    test('should build the room once setup', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);

        // When
        roomSetupService.setup({ type: 'create', game: RoomGame.CHAT, roomName: 'room', playerName: 'local', token: 'token' });
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        await fixture.whenStable();

        // Then
        expect(roomManagerService.buildBlockRoom).toHaveBeenCalledWith({ type: 'create', game: RoomGame.CHAT, roomName: 'room', playerName: 'local', token: 'token' }, 6, { [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT }, expect.any(AbortSignal));
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).toBeNull();

        // When
        const clearSpy = vi.spyOn(room, 'clear');
        fixture.destroy();

        // Then
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    test('should clear a room built once the page left', async () => {
        // Given: a room still being built
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);
        let build: (built: Room<object>) => void = () => undefined;
        vi.mocked(roomManagerService.buildBlockRoom).mockReturnValue(TestHelper.cast(new Promise<Room<object>>((resolve) => build = resolve)));
        const clearSpy = vi.spyOn(room, 'clear');
        roomSetupService.setup({ type: 'join', game: RoomGame.CHAT, roomName: 'room', playerName: 'local', token: 'token' });
        await vi.waitFor(() => expect(roomManagerService.buildBlockRoom).toHaveBeenCalled());

        // When: the page leaves, then the room is built
        fixture.destroy();
        build(room);

        // Then: the join asked again stops
        expect(vi.mocked(roomManagerService.buildBlockRoom).mock.calls[0][3]?.aborted).toEqual(true);
        await vi.waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
        expect(fixture.componentInstance.room()).toBeUndefined();
    });

    test('should make the setup form available again when the room can not be built', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(new Error('Already in game'));
        const loading: boolean[] = [];
        roomSetupService.loading$.subscribe((value: boolean) => loading.push(value));

        // When
        roomSetupService.setup({ type: 'join', game: RoomGame.CHAT, roomName: 'room', playerName: 'local', token: 'token' });

        // Then
        await vi.waitFor(() => expect(loading).toEqual([false, true, false]));
        expect(fixture.componentInstance.room()).toBeUndefined();
    });

    test('should give the room up and make the setup form available again once the join failed', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);
        roomSetupService.setup({ type: 'join', game: RoomGame.CHAT, roomName: 'room', playerName: 'local', token: 'token' });
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        const clearSpy = vi.spyOn(room, 'clear');

        // When
        TestHelper.cast<RoomNetworkMock>(room.roomConnection).joinFailed$.next(JoinFailure.ROOM_FULL);
        // The setup form shown again lists the rooms again
        answerOpenRooms();
        await fixture.whenStable();

        // Then
        expect(clearSpy).toHaveBeenCalledTimes(1);
        expect(fixture.componentInstance.room()).toBeUndefined();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).not.toBeNull();
    });

    test('should be destroyed without room', () => {
        expect(() => fixture.destroy()).not.toThrow();
    });
});
