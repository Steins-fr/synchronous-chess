import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { JoinFailure } from '@app/services/room-manager/classes/room-network/room-network';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import { RoomLock, RoomLocks } from '@app/services/room-session/room-lock';
import { RoomSessionStore } from '@app/services/room-session/room-session.store';
import RoomSetupService, { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { provideRooms, roomFromSetup } from './room-from-setup';

@Component({ template: '', providers: [provideRooms()] })
class HostComponent {
    public readonly room = roomFromSetup<ChatPayloads>(2, chatBlockChains);
}

describe('provideRooms', () => {
    beforeEach(() => {
        // Provided by the config of the app
        TestBed.configureTestingModule({ providers: [{ provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }] });
    });

    test('should give a component the services of its room', () => {
        // When
        const fixture = TestBed.createComponent(HostComponent);

        // Then
        expect(fixture.componentInstance.room()).toBeUndefined();
        expect(fixture.debugElement.injector.get(RoomSetupService)).toBeInstanceOf(RoomSetupService);
        expect(fixture.debugElement.injector.get(RoomManagerService)).toBeInstanceOf(RoomManagerService);
        expect(fixture.debugElement.injector.get(RoomSocketApi)).toBeInstanceOf(RoomSocketApi);
    });
});

describe('roomFromSetup', () => {
    const setup: RoomSetupInterface = { type: 'join', game: RoomGame.CHAT, roomName: 'room#000001', playerName: 'alice', token: 'a1' };

    let fixture: ComponentFixture<HostComponent>;
    let roomManagerService: RoomManagerService;
    let roomSetupService: RoomSetupService;
    let sessions: RoomSessionStore;
    let router: Router;
    let network: RoomNetworkMock;
    let room: Room<object>;
    let lock: RoomLock;

    beforeEach(async () => {
        sessionStorage.clear();
        network = Object.assign(new RoomNetworkMock('alice'), { roomName: 'room#000001' });
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), network.roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });
        lock = { release: vi.fn() };
        vi.spyOn(RoomLocks, 'hold').mockResolvedValue(lock);

        TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([]), { provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }] })
            // Provided by the component itself
            .overrideProvider(RoomManagerService, { useValue: roomManagerService });
        router = TestBed.inject(Router);
        sessions = TestBed.inject(RoomSessionStore);
        await router.navigateByUrl('/?tab=1');
        fixture = TestBed.createComponent(HostComponent);
        roomSetupService = fixture.debugElement.injector.get(RoomSetupService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        sessionStorage.clear();
    });

    const built = async (): Promise<void> => {
        roomSetupService.setup(setup);
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        await fixture.whenStable();
    };

    test('should show the room built in the URL, keep its session in the tab and hold its lock', async () => {
        // When
        await built();

        // Then
        expect(router.url).toBe('/?tab=1&room=room%23000001');
        expect(sessions.get('room#000001')).toEqual({ playerName: 'alice', token: 'a1' });
        expect(RoomLocks.hold).toHaveBeenCalledExactlyOnceWith('room#000001', 'alice', 0);
    });

    test('should remove the room from the URL, its session and its lock once the join failed', async () => {
        // Given
        await built();

        // When
        network.joinFailed$.next(JoinFailure.HOST_UNREACHABLE);
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.room()).toBeUndefined();
        expect(router.url).toBe('/?tab=1');
        expect(sessions.get('room#000001')).toBeUndefined();
        expect(lock.release).toHaveBeenCalledOnce();
    });

    test('should remove the room from the URL, and its session, once the room could not be built', async () => {
        // Given a room resumed from the URL
        sessions.save('room#000001', { playerName: 'alice', token: 'a1' });
        await router.navigateByUrl('/?room=room%23000001');
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(new Error('gone'));

        // When
        roomSetupService.setup({ ...setup, type: 'resume' });
        await vi.waitFor(() => expect(router.url).toBe('/'));

        // Then
        expect(sessions.get('room#000001')).toBeUndefined();
    });

    test('should keep the URL of a room not built once the page left', async () => {
        // Given
        await router.navigateByUrl('/?room=room%23000001');
        let fail: (error: Error) => void = () => undefined;
        vi.mocked(roomManagerService.buildBlockRoom).mockReturnValue(new Promise<never>((_resolve, reject) => fail = reject));
        roomSetupService.setup(setup);
        await vi.waitFor(() => expect(roomManagerService.buildBlockRoom).toHaveBeenCalled());
        sessions.save('room#000001', { playerName: 'alice', token: 'a1' });

        // When
        fixture.destroy();
        fail(new DOMException('Left', 'AbortError'));
        await fixture.whenStable();

        // Then
        expect(router.url).toBe('/?room=room%23000001');
    });

    test('should remove the session of the room and its lock once the page left through the app', async () => {
        // Given
        await built();

        // When
        fixture.destroy();

        // Then
        expect(sessions.get('room#000001')).toBeUndefined();
        await vi.waitFor(() => expect(lock.release).toHaveBeenCalledOnce());
    });

    test('should remove the session of the room being resumed once the page left through the app', async () => {
        // Given
        sessions.save('room#000001', { playerName: 'alice', token: 'a1' });
        vi.mocked(roomManagerService.buildBlockRoom).mockReturnValue(new Promise<never>(() => undefined));
        roomSetupService.setup({ ...setup, type: 'resume' });
        await vi.waitFor(() => expect(roomManagerService.buildBlockRoom).toHaveBeenCalled());

        // When
        fixture.destroy();

        // Then
        expect(sessions.get('room#000001')).toBeUndefined();
    });

    test('should not show the room built in the URL while the app navigates, the player leaving the page', async () => {
        // Given
        let build: (built: Room<object>) => void = () => undefined;
        vi.mocked(roomManagerService.buildBlockRoom).mockReturnValue(TestHelper.cast(new Promise<Room<object>>((resolve) => build = resolve)));
        roomSetupService.setup(setup);
        await vi.waitFor(() => expect(roomManagerService.buildBlockRoom).toHaveBeenCalled());
        vi.spyOn(router, 'currentNavigation').mockReturnValue(TestHelper.cast({}));
        const navigateByUrl = vi.spyOn(router, 'navigateByUrl');

        // When
        build(room);
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));

        // Then
        expect(navigateByUrl).not.toHaveBeenCalled();
        expect(router.url).toBe('/?tab=1');
    });
});
