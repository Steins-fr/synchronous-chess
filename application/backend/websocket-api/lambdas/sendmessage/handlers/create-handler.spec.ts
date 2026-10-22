import { GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getDatabase } from '@database/database';
import { connections, rooms } from '@database/schema';
import { verifyPassword } from '@helpers/password.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { RoomGame } from '@protocol/room-game.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import {
    anApiGatewayClient,
    aRequest,
    aRoom,
    AwsMocks,
    errorReply,
    HOST_CONNECTION,
    HOST_TOKEN,
    mockAws,
    postedPackets,
    readConnections,
    readRoom,
    storeConnection,
    storeRoom,
} from '@testing/api-mocks';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RoomService from '@services/room-service';
import CreateHandler from './create-handler';

// In epoch seconds
const NOW: number = 1_800_000_000;

describe('CreateHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();
    const request: RoomCreateRequest = { roomName: 'room', playerName: 'host', maxPlayer: 4, game: RoomGame.CHESS, token: HOST_TOKEN };

    function create(data: RoomCreateRequest): Promise<void> {
        return new CreateHandler(anApiGatewayClient(), HOST_CONNECTION, aRequest(RoomApiRequestTypeEnum.CREATE, data)).execute();
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should create the room of its host, keeping the hash of its token and its creation date', async () => {
        // Given
        vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00.000Z'), toFake: ['Date'] });

        // When
        await create(request);

        // Then
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { id: 7, type: 'created', data: { roomName: 'room', playerName: 'host', maxPlayer: 4 } } },
        ]);
        expect(await readConnections()).toEqual([{ connectionId: HOST_CONNECTION, roomName: 'room' }]);
        expect(await readRoom('room')).toStrictEqual({
            id: 'room',
            connectionId: HOST_CONNECTION,
            hostPlayer: 'host',
            maxPlayer: 4,
            game: RoomGame.CHESS,
            createdAt: '2026-10-11T12:00:00.000Z',
            nameKey: 'room',
            players: [{ playerName: 'host' }],
            queue: [],
            tokenHashes: { host: hashToken(HOST_TOKEN) },
            isPrivate: false,
            leaseUntil: Date.parse('2026-10-11T12:00:00.000Z') / 1000 + RoomService.LEASE,
        });
    });

    test('should disconnect its host, as $disconnect does, once its connection closed before its answer', async () => {
        // Given: the page closed while the paused database resumed, $disconnect finding no connection yet
        vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        apiGateway.on(PostToConnectionCommand).rejects(new GoneException({ $metadata: {}, message: 'Gone' }));

        // When
        await create(request);

        // Then: the room waits for its host, then expires, as a room whose host lost its connection
        expect(await readConnections()).toEqual([]);
        expect((await readRoom('room'))?.expiresAt).toEqual(NOW + RoomService.HOST_RECONNECTION_DELAY);
        expect(console.warn).toHaveBeenCalledWith(`Connection closed before its answer, disconnected: ${ HOST_CONNECTION }`);
    });

    test('should let the room wait for its host once $disconnect ran before the room was written', async () => {
        // Given: $disconnect deleted the connection before the room was written, finding no room to leave
        vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        apiGateway.on(PostToConnectionCommand).callsFake(async (): Promise<never> => {
            await getDatabase().delete(connections);
            throw new GoneException({ $metadata: {}, message: 'Gone' });
        });

        // When
        await create(request);

        // Then: not a room hosted by nobody, listed until its lease ends
        expect((await readRoom('room'))?.expiresAt).toEqual(NOW + RoomService.HOST_RECONNECTION_DELAY);
    });

    test('should fail once its answer can not be sent otherwise', async () => {
        // Given
        const failure: Error = new Error('Throttled');
        apiGateway.on(PostToConnectionCommand).rejects(failure);

        // When / Then
        await expect(create(request)).rejects.toBe(failure);
        expect(await readConnections()).toEqual([{ connectionId: HOST_CONNECTION, roomName: 'room' }]);
    });

    test('should create a private room, keeping a hash of its password', async () => {
        // When
        await create({ ...request, password: 'secret' });

        // Then
        const room = await readRoom('room') as Room;
        expect(room.passwordHash).not.toContain('secret');
        expect(verifyPassword('secret', room.passwordHash as string)).toEqual(true);
        expect(room.isPrivate).toEqual(true);
    });

    test.each([
        ['room name', { ...request, roomName: '' }],
        ['room name of other characters than spaces', { ...request, roomName: '   ' }],
        ['room name of a reasonable length', { ...request, roomName: 'r'.repeat(33) }],
        ['player name of a reasonable length', { ...request, playerName: 'p'.repeat(33) }],
        ['player name', { ...request, playerName: '' }],
        ['player count', { ...request, maxPlayer: 0 }],
        ['player count of a reasonable size', { ...request, maxPlayer: 17 }],
        ['whole player count', { ...request, maxPlayer: 2.5 }],
        ['player count as a number', { ...request, maxPlayer: 'p'.repeat(1000) as unknown as number }],
        ['token', { ...request, token: '' }],
        ['token of a reasonable length', { ...request, token: 't'.repeat(129) }],
        ['token as a string', { ...request, token: 42 as unknown as string }],
        ['known game', { ...request, game: 'go' as RoomGame }],
        ['password not empty', { ...request, password: '' }],
        ['password long enough', { ...request, password: 'p'.repeat(5) }],
        ['password of a reasonable length', { ...request, password: 'p'.repeat(129) }],
    ])('should refuse a request without %s', async (_field: string, data: RoomCreateRequest) => {
        // When / Then
        await expect(create(data)).rejects.toThrow('Payload not valid');
        expect(await readConnections()).toEqual([]);
        expect(await getDatabase().select().from(rooms)).toEqual([]);
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid')]);
    });

    test('should create a room on a connection whose creation of another room was refused', async () => {
        // Given
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'taken' });
        await storeRoom(aRoom({ id: 'taken', nameKey: 'taken', connectionId: 'other-connection' }));

        // When
        await create(request);

        // Then
        expect((await readRoom('room'))?.connectionId).toEqual(HOST_CONNECTION);
        expect(await readConnections()).toEqual([{ connectionId: HOST_CONNECTION, roomName: 'room' }]);
    });

    test('should refuse to create a room on the connection of another room it hosts', async () => {
        // Given
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'hosted' });
        await storeRoom(aRoom({ id: 'hosted', nameKey: 'hosted' }));

        // When / Then
        await expect(create(request)).rejects.toThrow('Already hosting a room');
        expect(await readConnections()).toEqual([{ connectionId: HOST_CONNECTION, roomName: 'hosted' }]);
        expect(await readRoom('room')).toBeNull();
    });

    test('should refuse a room name already taken', async () => {
        // Given: a room of that name, its host connected
        const existing: Room = aRoom({ connectionId: 'other-connection' });
        await storeRoom(existing);

        // When / Then
        await expect(create(request)).rejects.toThrow(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
        expect(await readRoom('room')).toStrictEqual(existing);
        expect(postedPackets(apiGateway)).toEqual([errorReply(RoomApiErrorMessage.ROOM_ALREADY_EXISTS)]);
    });
});
