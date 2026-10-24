import { GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getDatabase } from '@database/database';
import { connections, roomPasswordAttempts } from '@database/schema';
import { hashPassword } from '@helpers/password.helper';
import { epochSeconds } from '@helpers/time.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import { RoomGame } from '@protocol/room-game.enum';
import { ROOM_NAME_MAX_LENGTH } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import {
    anApiGatewayClient,
    aRequest,
    aRoom,
    AwsMocks,
    errorReply,
    HOST_CONNECTION,
    mockAws,
    postedPackets,
    readConnections,
    readRoom,
    storeRoom,
} from '@testing/api-mocks';
import { describe, expect, test, vi } from 'vitest';
import JoinHandler from './join-handler';

describe('JoinHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();
    const connection: string = 'other-connection';

    function join(data: RoomJoinRequest): Promise<void> {
        return new JoinHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.JOIN, data)).execute();
    }

    test('should queue the player and ask the host', async () => {
        // Given
        const room: Room = aRoom();
        await storeRoom(room);

        // When
        await join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'other', token: 'other-token' });

        // Then
        expect(await readConnections()).toEqual([{ connectionId: connection, roomName: 'room' }]);
        expect(await readRoom('room')).toStrictEqual({
            ...room,
            queue: [...room.queue, { playerName: 'other', connectionId: connection }],
            tokenHashes: { ...room.tokenHashes, other: hashToken('other-token') },
        });
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { type: 'joinRequest', data: { playerName: 'other' } } },
            { to: connection, packet: { id: 7, type: 'joiningRoom', data: { playerName: 'host' } } },
        ]);
    });

    test('should queue the player in a room of the longest id, a name of the longest and its tag', async () => {
        // Given
        const roomId: string = `${ 'r'.repeat(ROOM_NAME_MAX_LENGTH) }#000042`;
        await storeRoom(aRoom({ id: roomId }));

        // When
        await join({ roomName: roomId, game: RoomGame.CHESS, playerName: 'other', token: 'other-token' });

        // Then
        expect(await readConnections()).toEqual([{ connectionId: connection, roomName: roomId }]);
    });

    test('should cancel the join of a player whose connection closed before its answer, telling the host', async () => {
        // Given
        const room: Room = aRoom();
        await storeRoom(room);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        apiGateway.on(PostToConnectionCommand, { ConnectionId: connection }).rejects(new GoneException({ $metadata: {}, message: 'Gone' }));

        // When
        await join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'other', token: 'other-token' });

        // Then: as $disconnect does
        expect(await readConnections()).toEqual([]);
        expect((await readRoom('room'))?.queue).toEqual(room.queue);
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { type: 'joinRequest', data: { playerName: 'other' } } },
            { to: connection, packet: { id: 7, type: 'joiningRoom', data: { playerName: 'host' } } },
            { to: HOST_CONNECTION, packet: { type: 'joinCancelled', data: { playerName: 'other' } } },
        ]);
    });

    test('should cancel the join of a player whose $disconnect ran before it was queued, telling the host', async () => {
        // Given: $disconnect deleted its connection before the player was queued, finding nothing to undo
        const room: Room = aRoom();
        await storeRoom(room);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        apiGateway.on(PostToConnectionCommand, { ConnectionId: connection }).callsFake(async (): Promise<never> => {
            await getDatabase().delete(connections);
            throw new GoneException({ $metadata: {}, message: 'Gone' });
        });

        // When
        await join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'other', token: 'other-token' });

        // Then: the name free again
        expect((await readRoom('room'))?.queue).toEqual(room.queue);
        expect(postedPackets(apiGateway).at(-1)).toEqual({ to: HOST_CONNECTION, packet: { type: 'joinCancelled', data: { playerName: 'other' } } });
    });

    test.each([
        ['room name', { roomName: '', game: RoomGame.CHESS, playerName: 'other', token: 'other-token' }, 'Payload not valid'],
        ['room id of a reasonable length', { roomName: `${ 'r'.repeat(33) }#000042`, game: RoomGame.CHESS, playerName: 'other', token: 'other-token' }, 'Payload not valid'],
        ['player name of a reasonable length', { roomName: 'room', game: RoomGame.CHESS, playerName: 'p'.repeat(33), token: 'other-token' }, 'Payload not valid'],
        ['player name', { roomName: 'room', game: RoomGame.CHESS, playerName: '', token: 'other-token' }, 'Payload not valid'],
        ['token', { roomName: 'room', game: RoomGame.CHESS, playerName: 'other', token: '' }, 'Payload not valid'],
        ['player in the game', { roomName: 'room', game: RoomGame.CHESS, playerName: 'host', token: 'other-token' }, RoomApiErrorMessage.ALREADY_IN_GAME],
        ['player in the queue', { roomName: 'room', game: RoomGame.CHESS, playerName: 'guest', token: 'other-token' }, RoomApiErrorMessage.ALREADY_IN_QUEUE],
        ['game', { roomName: 'room', game: 'go' as RoomGame, playerName: 'other', token: 'other-token' }, 'Payload not valid'],
        ['room of another game', { roomName: 'room', game: RoomGame.CHAT, playerName: 'other', token: 'other-token' }, RoomApiErrorMessage.OTHER_GAME],
        ['room missing', { roomName: 'missing', game: RoomGame.CHESS, playerName: 'other', token: 'other-token' }, 'Room \'missing\' does not exist'],
    ])('should refuse a request with its %s', async (_case: string, data: RoomJoinRequest, message: string) => {
        // Given
        const room: Room = aRoom();
        await storeRoom(room);

        // When / Then
        await expect(join(data)).rejects.toThrow(message);
        expect(await readConnections()).toEqual([]);
        expect(await readRoom('room')).toStrictEqual(room);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });

    test('should refuse to queue a player while the host is disconnected', async () => {
        // Given
        const room: Room = aRoom({ expiresAt: epochSeconds() + 60 });
        await storeRoom(room);

        // When / Then
        await expect(join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'other', token: 'other-token' })).rejects.toThrow(RoomApiErrorMessage.HOST_DISCONNECTED);
        expect(await readConnections()).toEqual([]);
        expect(await readRoom('room')).toStrictEqual(room);
        expect(postedPackets(apiGateway)).toEqual([errorReply(RoomApiErrorMessage.HOST_DISCONNECTED, connection)]);
    });

    test('should queue a player giving the password of a private room', async () => {
        // Given
        const room: Room = aRoom({ passwordHash: hashPassword('secret') });
        await storeRoom(room);

        // When
        await join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'other', password: 'secret', token: 'other-token' });

        // Then
        expect((await readRoom('room'))?.queue).toEqual([...room.queue, { playerName: 'other', connectionId: connection }]);
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { type: 'joinRequest', data: { playerName: 'other' } } },
            { to: connection, packet: { id: 7, type: 'joiningRoom', data: { playerName: 'host' } } },
        ]);
    });

    test.each<[string, string | undefined]>([
        ['a wrong password', 'wrong'],
        ['no password', undefined],
    ])('should refuse a player giving %s for a private room, before telling a name is in the room', async (_case: string, password: string | undefined) => {
        // Given
        const room: Room = aRoom({ passwordHash: hashPassword('secret') });
        await storeRoom(room);

        // When / Then
        await expect(join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'host', password, token: 'other-token' })).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(await readConnections()).toEqual([]);
        expect(await readRoom('room')).toStrictEqual(room);
        expect(postedPackets(apiGateway)).toEqual([errorReply(RoomApiErrorMessage.WRONG_PASSWORD, connection)]);
    });

    test('should tell the host of a private room is disconnected without counting the password', async () => {
        // Given
        await storeRoom(aRoom({ passwordHash: hashPassword('secret'), expiresAt: epochSeconds() + 60 }));

        // When / Then
        await expect(join({ roomName: 'room', game: RoomGame.CHESS, playerName: 'other', password: 'secret', token: 'other-token' })).rejects.toThrow(RoomApiErrorMessage.HOST_DISCONNECTED);
        expect(await getDatabase().select().from(roomPasswordAttempts)).toEqual([]);
    });
});
