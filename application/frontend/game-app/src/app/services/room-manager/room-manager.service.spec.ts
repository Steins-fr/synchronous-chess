import { TestBed } from '@angular/core/testing';
import RoomManagerService from './room-manager.service';
import { NotificationService } from '../notification/notification.service';
import { RoomApiRequestTypeEnum, RoomSocketApi, RoomSocketApiNotifications } from '../room-api/room-socket.api';
import { BlockRoom } from './classes/room/block-room/block-room';
import { HostRoomNetwork } from './classes/room-network/host-room-network';
import { PeerRoomNetwork } from './classes/room-network/peer-room-network';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('RoomManagerService', () => {
    let service: RoomManagerService;
    let roomSocketApi: RoomSocketApi;
    let notificationService: NotificationService;
    let room: BlockRoom<object> | undefined;

    beforeEach(() => {
        roomSocketApi = TestHelper.cast<RoomSocketApi>({
            notification$: new Subject<RoomSocketApiNotifications>(),
            send: vi.fn(),
            close: vi.fn(),
        });
        notificationService = TestHelper.cast<NotificationService>({ error: vi.fn() });
        vi.spyOn(BlockRoom, 'createKeyPair').mockResolvedValue(TestHelper.cast<CryptoKeyPair>({ publicKey: {}, privateKey: {} }));

        TestBed.configureTestingModule({
            providers: [
                RoomManagerService,
                { provide: RoomSocketApi, useValue: roomSocketApi },
                { provide: NotificationService, useValue: notificationService },
            ],
        });
        service = TestBed.inject(RoomManagerService);
        room = undefined;
    });

    afterEach(() => {
        room?.clear();
        vi.restoreAllMocks();
    });

    test('should create a room as host', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ roomName: 'room', maxPlayer: 2, playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'create', roomName: 'room', playerName: 'host' }, 2);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.CREATE, { roomName: 'room', maxPlayer: 2, playerName: 'host' });
        expect(room.roomConnection).toBeInstanceOf(HostRoomNetwork);
        expect(room.localPlayer.name).toEqual('host');
    });

    test.each([
        { roomName: 'room', maxPlayer: 2, playerName: 'other' },
        { roomName: 'other', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room', maxPlayer: 3, playerName: 'host' },
    ])('should fail the room creation on mismatched response %o', async (response) => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue(response);

        // When
        const build = service.buildBlockRoom({ type: 'create', roomName: 'room', playerName: 'host' }, 2);

        // Then
        await expect(build).rejects.toThrow('Room creation failed, mismatched parameters');
        expect(notificationService.error).toHaveBeenCalledWith('La salle existe déjà');
    });

    test('should join a room as peer', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.JOIN, { roomName: 'room', playerName: 'peer' });
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
        expect(room.queue()).toEqual(['host']);
    });

    test('should notify when the room can not be joined', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error('full'));

        // When
        const build = service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2);

        // Then
        await expect(build).rejects.toThrow('full');
        expect(notificationService.error).toHaveBeenCalledWith('La salle est pleine ou elle n\'existe plus.');
    });
});
