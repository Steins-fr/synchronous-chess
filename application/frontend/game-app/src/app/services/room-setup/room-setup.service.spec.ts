import { TestBed } from '@angular/core/testing';
import RoomSetupService, { RoomSetupInterface } from './room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { RoomLock, RoomLocks } from '@app/services/room-session/room-lock';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('RoomSetupService', () => {
    test('setup should emit the setup and start loading', () => {
        // Given
        TestBed.configureTestingModule({ providers: [RoomSetupService] });
        const service: RoomSetupService = TestBed.inject(RoomSetupService);
        const setups: RoomSetupInterface[] = [];
        const loadings: boolean[] = [];
        service.setup$.subscribe((setup: RoomSetupInterface) => setups.push(setup));
        service.loading$.subscribe((loading: boolean) => loadings.push(loading));

        // When
        service.setup({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', token: 'token' });
        service.setup({ type: 'join', game: RoomGame.CHAT, roomName: 'private', playerName: 'player', password: 'secret', token: 'token' });

        // Then
        expect(setups).toEqual([
            { type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', token: 'token' },
            { type: 'join', game: RoomGame.CHAT, roomName: 'private', playerName: 'player', password: 'secret', token: 'token' },
        ]);
        expect(loadings).toEqual([false, true, true]);
    });

    test('roomIsSetup should emit the room state and stop loading', () => {
        // Given
        const service: RoomSetupService = new RoomSetupService();
        const roomIsSetups: boolean[] = [];
        const loadings: boolean[] = [];
        service.roomIsSetup$.subscribe((roomIsSetup: boolean) => roomIsSetups.push(roomIsSetup));
        service.loading$.subscribe((loading: boolean) => loadings.push(loading));
        service.setup({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', token: 'token' });

        // When
        service.roomIsSetup(true);

        // Then
        expect(roomIsSetups).toEqual([false, true]);
        expect(loadings).toEqual([false, true, false]);
    });

    test('leave should emit the leave of the room', () => {
        // Given
        const service: RoomSetupService = new RoomSetupService();
        const leave = vi.fn();
        service.leave$.subscribe(leave);

        // When
        service.leave();

        // Then
        expect(leave).toHaveBeenCalledOnce();
    });

    describe('lock', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        const lock = (): RoomLock => ({ release: vi.fn() });

        test('should hold the lock of the player in the room, once', async () => {
            // Given
            const service: RoomSetupService = new RoomSetupService();
            const held: RoomLock = lock();
            const holdRoomLock = vi.spyOn(RoomLocks, 'hold').mockResolvedValue(held);

            // When
            const first: boolean = await service.holdLock('room#000001', 'alice', 2000);
            const again: boolean = await service.holdLock('room#000001', 'alice');

            // Then
            expect(first).toBe(true);
            expect(again).toBe(true);
            expect(holdRoomLock).toHaveBeenCalledExactlyOnceWith('room#000001', 'alice', 2000);
            expect(held.release).not.toHaveBeenCalled();
        });

        test('should release the former lock, holding another one', async () => {
            // Given
            const service: RoomSetupService = new RoomSetupService();
            const former: RoomLock = lock();
            vi.spyOn(RoomLocks, 'hold').mockResolvedValueOnce(former).mockResolvedValueOnce(lock());
            await service.holdLock('room#000001', 'alice');

            // When
            const held: boolean = await service.holdLock('room#000002', 'alice');

            // Then
            expect(held).toBe(true);
            await vi.waitFor(() => expect(former.release).toHaveBeenCalledOnce());
        });

        test('should tell the lock another tab holds, asked again next time', async () => {
            // Given
            const service: RoomSetupService = new RoomSetupService();
            const holdRoomLock = vi.spyOn(RoomLocks, 'hold').mockResolvedValueOnce(undefined).mockResolvedValueOnce(lock());

            // When, Then: the other tab left meanwhile
            await expect(service.holdLock('room#000001', 'alice')).resolves.toBe(false);
            await expect(service.holdLock('room#000001', 'alice')).resolves.toBe(true);
            expect(holdRoomLock).toHaveBeenCalledTimes(2);
        });

        test('should ask the lock once for the calls of the same name meanwhile', async () => {
            // Given
            const service: RoomSetupService = new RoomSetupService();
            const held: RoomLock = lock();
            const holdRoomLock = vi.spyOn(RoomLocks, 'hold').mockResolvedValue(held);

            // When
            const holding: boolean[] = await Promise.all([service.holdLock('room#000001', 'alice'), service.holdLock('room#000001', 'alice')]);
            service.releaseLock();
            await Promise.resolve();

            // Then
            expect(holding).toEqual([true, true]);
            expect(holdRoomLock).toHaveBeenCalledOnce();
            expect(held.release).toHaveBeenCalledOnce();
        });

        test('should release the lock, the one held meanwhile included', async () => {
            // Given
            const service: RoomSetupService = new RoomSetupService();
            const held: RoomLock = lock();
            const late: RoomLock = lock();
            vi.spyOn(RoomLocks, 'hold').mockResolvedValueOnce(held).mockResolvedValueOnce(late);
            await service.holdLock('room#000001', 'alice');

            // When
            service.releaseLock();
            const holding: Promise<boolean> = service.holdLock('room#000002', 'alice');
            service.releaseLock();

            // Then
            await expect(holding).resolves.toBe(false);
            expect(held.release).toHaveBeenCalledOnce();
            await vi.waitFor(() => expect(late.release).toHaveBeenCalledOnce());
            expect(() => service.releaseLock()).not.toThrow();
        });
    });
});
