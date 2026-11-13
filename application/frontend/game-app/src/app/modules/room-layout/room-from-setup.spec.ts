import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { JoinFailure } from '@app/services/room-manager/classes/room-network/room-network';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import { RoomLock, RoomLocks } from '@app/services/room-session/room-lock';
import { RoomSessionStore } from '@app/services/room-session/room-session.store';
import RoomSetupService, { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
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

    test.each([JoinFailure.HOST_UNREACHABLE, JoinFailure.REMOVED])('should remove the room from the URL, its session and its lock once the join failed: %s', async (failure: JoinFailure) => {
        // Given
        await built();

        // When
        network.joinFailed$.next(failure);
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.room()).toBeUndefined();
        expect(router.url).toBe('/?tab=1');
        expect(sessions.get('room#000001')).toBeUndefined();
        expect(lock.release).toHaveBeenCalledOnce();
    });

    test('should clear the room the player leaves, and remove it from the URL, its session and its lock', async () => {
        // Given
        await built();
        const clear = vi.spyOn(room, 'clear');
        const roomIsSetups: boolean[] = [];
        roomSetupService.roomIsSetup$.subscribe((roomIsSetup: boolean) => roomIsSetups.push(roomIsSetup));

        // When
        roomSetupService.leave();
        await fixture.whenStable();

        // Then
        expect(clear).toHaveBeenCalledOnce();
        expect(fixture.componentInstance.room()).toBeUndefined();
        expect(roomIsSetups).toEqual([true, false]);
        expect(router.url).toBe('/?tab=1');
        expect(sessions.get('room#000001')).toBeUndefined();
        expect(lock.release).toHaveBeenCalledOnce();
    });

    test('should leave no room while the room is built', async () => {
        // Given
        vi.mocked(roomManagerService.buildBlockRoom).mockReturnValue(new Promise(() => undefined));
        roomSetupService.setup(setup);
        const roomIsSetup = vi.fn();
        roomSetupService.roomIsSetup$.subscribe(roomIsSetup);

        // When
        roomSetupService.leave();
        await fixture.whenStable();

        // Then
        expect(roomIsSetup).toHaveBeenCalledExactlyOnceWith(false);
        expect(RoomLocks.hold).not.toHaveBeenCalled();
    });

    test('should remove the room from the URL, and its session, once the room could not be built', async () => {
        // Given a room resumed from the URL
        sessions.save('room#000001', { playerName: 'alice', token: 'a1' });
        await router.navigateByUrl('/?room=room%23000001');
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(new RoomApiError('Room \'room#000001\' does not exist'));

        // When
        roomSetupService.setup({ ...setup, type: 'resume' });
        await vi.waitFor(() => expect(router.url).toBe('/'));

        // Then
        expect(sessions.get('room#000001')).toBeUndefined();
    });

    test.each([RoomApiErrorMessage.ALREADY_IN_GAME, RoomApiErrorMessage.ALREADY_IN_QUEUE])('should ask another name for a room joined under a name another player holds: %s', async (error: RoomApiErrorMessage) => {
        // Given
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(new RoomApiError(error));
        const nameTaken: string[] = [];
        roomSetupService.nameTaken$.subscribe((roomId: string) => nameTaken.push(roomId));
        const roomIsSetup: boolean[] = [];
        roomSetupService.roomIsSetup$.subscribe((value: boolean) => roomIsSetup.push(value));

        // When
        roomSetupService.setup(setup);

        // Then: once the room given up, its form available again
        await vi.waitFor(() => expect(nameTaken).toEqual(['room#000001']));
        expect(roomIsSetup).toEqual([false, false]);
    });

    test.each<[string, RoomSetupInterface, Error]>([
        ['a room resumed under a name another player took', { ...setup, type: 'resume' }, new RoomApiError(RoomApiErrorMessage.ALREADY_IN_GAME)],
        ['a room created', { ...setup, type: 'create' }, new RoomApiError(RoomApiErrorMessage.ALREADY_IN_GAME)],
        ['a room joined refused otherwise', setup, new RoomApiError(RoomApiErrorMessage.WRONG_PASSWORD)],
        ['a room joined failed', setup, new Error(RoomApiErrorMessage.ALREADY_IN_GAME)],
    ])('should ask no other name for %s', async (_case: string, given: RoomSetupInterface, error: Error) => {
        // Given
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(error);
        const nameTaken = vi.fn();
        roomSetupService.nameTaken$.subscribe(nameTaken);
        const loading: boolean[] = [];
        roomSetupService.loading$.subscribe((value: boolean) => loading.push(value));

        // When
        roomSetupService.setup(given);
        await vi.waitFor(() => expect(loading).toEqual([false, true, false]));

        // Then
        expect(nameTaken).not.toHaveBeenCalled();
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

    test.each<[string, Error]>([
        ['its former connection still in the room', new RoomApiError(RoomApiErrorMessage.FORMER_CONNECTION)],
        ['the API not answering', new Error('Timeout')],
    ])('should keep the session and the URL of a room resumed refused for a while only: %s', async (_case: string, error: Error) => {
        // Given
        sessions.save('room#000001', { playerName: 'alice', token: 'a1' });
        await router.navigateByUrl('/?room=room%23000001');
        vi.mocked(roomManagerService.buildBlockRoom).mockRejectedValue(error);
        const releaseLock = vi.spyOn(roomSetupService, 'releaseLock');
        const loading: boolean[] = [];
        roomSetupService.loading$.subscribe((value: boolean) => loading.push(value));

        // When
        roomSetupService.setup({ ...setup, type: 'resume' });
        await vi.waitFor(() => expect(loading).toEqual([false, true, false]));
        await fixture.whenStable();

        // Then: a reload resumes it
        expect(sessions.get('room#000001')).toEqual({ playerName: 'alice', token: 'a1' });
        expect(router.url).toBe('/?room=room%23000001');
        expect(releaseLock).toHaveBeenCalledOnce();
    });

    test('should show the room in the URL again once a link to the page itself dropped it', async () => {
        // Given
        await built();

        // When
        await router.navigateByUrl('/?tab=1');
        await fixture.whenStable();

        // Then
        await vi.waitFor(() => expect(router.url).toBe('/?tab=1&room=room%23000001'));
    });
});
