import { TestBed } from '@angular/core/testing';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import RoomManagerService from './room-manager.service';
import { NotificationService } from '../notification/notification.service';
import { RoomApiError, RoomSocketApi } from '../room-api/room-socket.api';
import { BlockRoom } from './classes/room/block-room/block-room';
import { BlockChainName } from './classes/room/block-room/block-chain-name.enum';
import { PeerRoomNetwork } from './classes/room-network/peer-room-network';
import { JoinFailure } from './classes/room-network/room-network';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomGame } from '@protocol/room-game.enum';
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

    test('should create a room as host, under its id', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ roomName: 'room#000042', maxPlayer: 2, playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.CREATE, { roomName: 'room', maxPlayer: 2, game: RoomGame.CHESS, playerName: 'host', token: 'token' });
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
        expect(room.roomConnection.initiator).toEqual(true);
        expect(room.roomConnection.roomName).toEqual('room#000042');
        expect(room.localPlayer.name).toEqual('host');
        expect(BlockRoom.createKeys).toHaveBeenCalledWith('host');
    });

    test('should notify the host when its room can not move to a new socket', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ roomName: 'room#000042', maxPlayer: 2, playerName: 'host' });
        vi.mocked(roomSocketApi.reconnect).mockRejectedValue(new RoomApiError('Room \'room\' does not exist'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        room = await service.buildBlockRoom({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // When
        (roomSocketApi.closed$ as Subject<void>).next();
        await vi.waitFor(() => expect(notificationService.error).toHaveBeenCalled());

        // Then
        expect(roomSocketApi.reconnect).toHaveBeenCalledWith({ roomName: 'room#000042', playerName: 'host', token: 'token' });
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.notifications.roomLost' });
    });

    test.each([
        { roomName: 'room#000042', maxPlayer: 2, playerName: 'other' },
        { roomName: 'other#000042', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room#', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room#00004x', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room#0000042', maxPlayer: 2, playerName: 'host' },
        { roomName: 'room#000042', maxPlayer: 3, playerName: 'host' },
    ])('should fail the room creation on mismatched response %o', async (response) => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue(response);

        // When
        const build = service.buildBlockRoom({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow('Room creation failed, mismatched parameters');
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.errors.notCreated' });
    });

    test('should create a room under the trimmed name', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ roomName: 'my room#000042', maxPlayer: 2, playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'create', game: RoomGame.CHESS, roomName: ' my room ', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        expect(room.roomConnection.roomName).toEqual('my room#000042');
    });

    test('should notify when the room can not be created', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error('No tag left for the room name'));

        // When
        const build = service.buildBlockRoom({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'host' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow('No tag left for the room name');
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.errors.notCreated' });
    });

    test('should reject an empty routing at compile time', () => {
        // @ts-expect-error a routing without message type could not carry any message
        const build = (): Promise<BlockRoom<object>> => service.buildBlockRoom<object>({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'host' }, 2, {});

        expect(build).toBeTypeOf('function');
    });

    test('should join a room as peer', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.JOIN, { roomName: 'room', playerName: 'peer', game: RoomGame.CHESS, token: 'token' });
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
        expect(room.queue()).toEqual(['host']);
    });

    test('should create a private room, and join it with its password', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValueOnce({ roomName: 'room#000042', maxPlayer: 6, playerName: 'host' });
        vi.mocked(roomSocketApi.send).mockResolvedValueOnce({ playerName: 'host' });

        // When
        room = await service.buildBlockRoom({ type: 'create', game: RoomGame.CHAT, roomName: 'room', playerName: 'host', password: 'secret' }, 6, { move: BlockChainName.CHAT });
        room.clear();
        room = await service.buildBlockRoom({ type: 'join', game: RoomGame.CHAT, roomName: 'room#000042', playerName: 'peer', password: 'secret' }, 6, { move: BlockChainName.CHAT });

        // Then
        expect(roomSocketApi.send).toHaveBeenNthCalledWith(1, RoomApiRequestTypeEnum.CREATE, {
            roomName: 'room', maxPlayer: 6, game: RoomGame.CHAT, password: 'secret', playerName: 'host', token: 'token',
        });
        expect(roomSocketApi.send).toHaveBeenNthCalledWith(2, RoomApiRequestTypeEnum.JOIN, {
            roomName: 'room#000042', playerName: 'peer', game: RoomGame.CHAT, password: 'secret', token: 'token',
        });
    });

    test.each([
        { error: RoomApiErrorMessage.WRONG_PASSWORD, notification: { key: 'rooms.errors.wrongPassword' } },
        { error: RoomApiErrorMessage.OTHER_GAME, notification: { key: 'rooms.errors.otherGame' } },
        { error: RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS, notification: { key: 'rooms.errors.tooManyPasswords' } },
    ])('should notify a join refused for good at once, on $error', async ({ error, notification }) => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error(error));

        // When
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer', password: 'wrong' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow(error);
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
        expect(notificationService.error).toHaveBeenCalledWith(notification);
    });

    test('should notify a peer joining a private room without its password', async () => {
        // Given: the room listed as public before it became private
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error(RoomApiErrorMessage.WRONG_PASSWORD));

        // When
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.errors.private' });
    });

    test('should notify a peer when the room it took over can not move to a new socket', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });
        room = await service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // When
        TestHelper.cast<{ roomLostSubject: Subject<void> }>(room.roomConnection).roomLostSubject.next();

        // Then
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.notifications.roomLost' });
    });

    test('should tell a peer it joins the room again, the connection to the host failed', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });
        room = await service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // When
        TestHelper.cast<{ joiningAgainSubject: Subject<void> }>(room.roomConnection).joiningAgainSubject.next();

        // Then
        expect(notificationService.info).toHaveBeenCalledWith({ key: 'rooms.notifications.joiningAgain' });
    });

    test.each([
        { error: RoomApiErrorMessage.ALREADY_IN_GAME, message: { key: 'rooms.notifications.nameStillInRoom' } },
    ])('should tell a peer the API refuses it joining the room again for a while, $error', async ({ error, message }) => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });
        room = await service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // When
        TestHelper.cast<{ joinDelayedSubject: Subject<string> }>(room.roomConnection).joinDelayedSubject.next(error);

        // Then
        expect(notificationService.info).toHaveBeenCalledWith(message);
    });

    test.each([
        { failure: JoinFailure.ROOM_FULL, message: { key: 'rooms.notifications.roomFull' } },
        { failure: JoinFailure.HOST_UNREACHABLE, message: { key: 'rooms.notifications.hostUnreachable' } },
    ])('should notify a peer giving the room up, $failure', async ({ failure, message }) => {
        // Given
        vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });
        room = await service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // When
        TestHelper.cast<{ joinFailedSubject: Subject<JoinFailure> }>(room.roomConnection).joinFailedSubject.next(failure);

        // Then
        expect(notificationService.error).toHaveBeenCalledWith(message);
    });

    test('should notify when the room can not be joined', async () => {
        // Given
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error('full'));

        // When
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toThrow('full');
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.errors.fullOrGone' });
    });

    test('should join again while its name is still in the room, as after a reload of the page', async () => {
        // Given the host has not noticed yet the former connection of the player left
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send)
            .mockRejectedValueOnce(new Error(RoomApiErrorMessage.ALREADY_IN_GAME))
            .mockRejectedValueOnce(new Error(RoomApiErrorMessage.ALREADY_IN_QUEUE))
            .mockResolvedValue({ playerName: 'host' });

        // When
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });
        await vi.advanceTimersByTimeAsync(4000);
        room = await build;

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(3);
        expect(notificationService.info).toHaveBeenCalledTimes(1);
        expect(notificationService.error).not.toHaveBeenCalled();
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
    });

    test('should stop joining once the page left, without notifying it', async () => {
        // Given
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error(RoomApiErrorMessage.ALREADY_IN_GAME));
        const left: AbortController = new AbortController();
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS }, left.signal);
        const rejected = expect(build).rejects.toThrow(DOMException);
        await vi.advanceTimersByTimeAsync(0);

        // When
        left.abort();
        await vi.advanceTimersByTimeAsync(20_000);

        // Then
        await rejected;
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
        expect(notificationService.error).not.toHaveBeenCalled();
    });

    test('should not connect to the host once the page left while the join was sent', async () => {
        // Given
        let joined: (response: RoomJoinResponse) => void = () => undefined;
        vi.mocked(roomSocketApi.send).mockReturnValue(new Promise<RoomJoinResponse>((resolve) => joined = resolve));
        const left: AbortController = new AbortController();
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS }, left.signal);
        await vi.waitFor(() => expect(roomSocketApi.send).toHaveBeenCalled());

        // When
        left.abort();
        joined({ playerName: 'host' });

        // Then
        await expect(build).rejects.toMatchObject({ name: 'AbortError' });
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
        expect(notificationService.error).not.toHaveBeenCalled();
    });

    test('should join again while the host reconnects its room', async () => {
        // Given
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send)
            .mockRejectedValueOnce(new Error(RoomApiErrorMessage.HOST_DISCONNECTED))
            .mockResolvedValue({ playerName: 'host' });

        // When
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });
        await vi.advanceTimersByTimeAsync(2000);
        room = await build;

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
        expect(notificationService.info).toHaveBeenCalledWith({ key: 'rooms.notifications.hostReconnecting' });
        expect(room.roomConnection).toBeInstanceOf(PeerRoomNetwork);
    });

    test.each([
        { error: RoomApiErrorMessage.ALREADY_IN_GAME, notification: { key: 'rooms.errors.nameInRoom' } },
        { error: RoomApiErrorMessage.ALREADY_IN_QUEUE, notification: { key: 'rooms.errors.nameWaiting' } },
        { error: RoomApiErrorMessage.HOST_DISCONNECTED, notification: { key: 'rooms.errors.hostDisconnected' } },
    ])('should give up joining after 20 seconds, on $error', async ({ error, notification }) => {
        // Given
        vi.useFakeTimers();
        vi.mocked(roomSocketApi.send).mockRejectedValue(new Error(error));

        // When
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });
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
        const build = service.buildBlockRoom({ type: 'join', game: RoomGame.CHESS, roomName: 'room', playerName: 'peer' }, 2, { move: BlockChainName.CHESS });

        // Then
        await expect(build).rejects.toEqual('closed');
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
        expect(notificationService.error).toHaveBeenCalledWith({ key: 'rooms.errors.fullOrGone' });
    });
});
