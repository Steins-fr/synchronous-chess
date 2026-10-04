import { TestBed } from '@angular/core/testing';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import RoomManagerService from './room-manager.service';
import { NotificationService } from '../notification/notification.service';
import { RoomApiError, RoomSocketApi } from '../room-api/room-socket.api';
import { BlockRoom } from './classes/room/block-room/block-room';
import { BlockChainName } from './classes/room/block-room/block-chain-name.enum';
import { PeerRoomNetwork } from './classes/room-network/peer-room-network';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum, RoomSocketApiNotifications } from '@protocol/socket-packet-payload.type';
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
            closed$: new Subject<void>(),
            send: vi.fn(),
            reconnect: vi.fn(),
            keepAlive: vi.fn(),
            socketOpenedAt: Date.now(),
            close: vi.fn(),
        });
        notificationService = TestHelper.cast<NotificationService>({ error: vi.fn(), info: vi.fn() });
        // The token of the page
        vi.spyOn(CryptoHelper, 'randomHex').mockReturnValue('token');
        vi.spyOn(BlockRoom, 'createKeys').mockResolvedValue({ keyPair: TestHelper.cast<CryptoKeyPair>({ publicKey: {}, privateKey: {} }), publicJwk: {} });

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
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should create a room as host', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ roomName: 'room', maxPlayer: 2, playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'create', roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.CREATE, { roomName: 'room', maxPlayer: 2, playerName: 'host', token: 'token' });
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
        expect(room.roomConnection.initiator).toEqual(true);
        expect(room.localPlayer.name).toEqual('host');
        expect(BlockRoom.createKeys).toHaveBeenCalledWith('host');
    });

    test('should notify the host when its room can not move to a new socket', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ roomName: 'room', maxPlayer: 2, playerName: 'host' });
        vi.mocked(roomSocketApi.reconnect).mockRejectedValue(new RoomApiError('Room \'room\' does not exist'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        room = await service.buildBlockRoom({ type: 'create', roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // When
        (roomSocketApi.closed$ as Subject<void>).next();
        await vi.waitFor(() => expect(notificationService.error).toHaveBeenCalled());

        // Then
        expect(roomSocketApi.reconnect).toHaveBeenCalledWith({ roomName: 'room', playerName: 'host', token: 'token' });
        expect(notificationService.error).toHaveBeenCalledWith('La salle a perdu sa connexion au serveur : plus personne ne peut la rejoindre.');
    });

    test.each([
        { roomName: 'room', maxPlayer: 2, playerName: 'other' },
        { roomName: 'other', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room', maxPlayer: 3, playerName: 'host' },
    ])('should fail the room creation on mismatched response %o', async (response) => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue(response);

        // When
        const build = service.buildBlockRoom({ type: 'create', roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow('Room creation failed, mismatched parameters');
        expect(notificationService.error).toHaveBeenCalledWith('La salle n\'a pas pu être créée.');
    });

    test('should notify when the room to create exists already', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error(RoomApiErrorMessage.ROOM_ALREADY_EXISTS));

        // When
        const build = service.buildBlockRoom({ type: 'create', roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
        expect(notificationService.error).toHaveBeenCalledWith('La salle existe déjà.');
    });

    test('should reject an empty routing at compile time', () => {
        // @ts-expect-error a routing without message type could not carry any message
        const build = (): Promise<BlockRoom<object>> => service.buildBlockRoom<object>({ type: 'create', roomName: 'room', playerName: 'host' }, 2, {});

        expect(build).toBeTypeOf('function');
    });

    test('should join a room as peer', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.JOIN, { roomName: 'room', playerName: 'peer', token: 'token' });
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
        expect(room.queue()).toEqual(['host']);
    });

    test('should notify a peer when the room it took over can not move to a new socket', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });
        room = await service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // When
        TestHelper.cast<{ roomLostSubject: Subject<void> }>(room.roomConnection).roomLostSubject.next();

        // Then
        expect(notificationService.error).toHaveBeenCalledWith('La salle a perdu sa connexion au serveur : plus personne ne peut la rejoindre.');
    });

    test('should notify when the room can not be joined', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error('full'));

        // When
        const build = service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow('full');
        expect(notificationService.error).toHaveBeenCalledWith('La salle est pleine ou elle n\'existe plus.');
    });

    test('should join again while its name is still in the room, as after a reload of the page', async () => {
        // Given the host has not noticed yet the former connection of the player left
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send)
            .mockRejectedValueOnce(new Error(RoomApiErrorMessage.ALREADY_IN_GAME))
            .mockRejectedValueOnce(new Error(RoomApiErrorMessage.ALREADY_IN_QUEUE))
            .mockResolvedValue({ playerName: 'host' });

        // When
        const build = service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });
        await vi.advanceTimersByTimeAsync(4000);
        room = await build;

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(3);
        expect(notificationService.info).toHaveBeenCalledTimes(1);
        expect(notificationService.error).not.toHaveBeenCalled();
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
    });

    test('should join again while the host reconnects its room', async () => {
        // Given
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send)
            .mockRejectedValueOnce(new Error(RoomApiErrorMessage.HOST_DISCONNECTED))
            .mockResolvedValue({ playerName: 'host' });

        // When
        const build = service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });
        await vi.advanceTimersByTimeAsync(2000);
        room = await build;

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
        expect(notificationService.info).toHaveBeenCalledWith('L\'hôte de la salle se reconnecte…');
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
    });

    test.each([
        { error: RoomApiErrorMessage.ALREADY_IN_GAME, notification: 'Un joueur de ce nom est déjà dans la salle.' },
        { error: RoomApiErrorMessage.ALREADY_IN_QUEUE, notification: 'Un joueur de ce nom attend déjà d\'entrer dans la salle.' },
        { error: RoomApiErrorMessage.HOST_DISCONNECTED, notification: 'L\'hôte de la salle s\'est déconnecté.' },
    ])('should give up joining after 20 seconds, on $error', async ({ error, notification }) => {
        // Given
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error(error));

        // When
        const build = service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });
        const rejected = expect(build).rejects.toThrow(error);
        await vi.advanceTimersByTimeAsync(20000);

        // Then
        await rejected;
        expect(roomSocketApi.send).toHaveBeenCalledTimes(11);
        expect(notificationService.error).toHaveBeenCalledWith(notification);
    });

    test('should not join again on a failure which is not an error', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue('closed');

        // When
        const build = service.buildBlockRoom({ type: 'join', roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toEqual('closed');
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
        expect(notificationService.error).toHaveBeenCalledWith('La salle est pleine ou elle n\'existe plus.');
    });
});
