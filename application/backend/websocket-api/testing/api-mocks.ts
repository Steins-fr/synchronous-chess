import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getDatabase } from '@database/database';
import { connections, roomPlayers, roomQueue, rooms, roomTokens } from '@database/schema';
import DatabaseException, { DatabaseOperationEnum } from '@exceptions/database-exception';
import { hashToken } from '@helpers/token.helper';
import Connection from '@models/connection';
import Player from '@models/player';
import Room from '@models/room';
import { RoomGame } from '@protocol/room-game.enum';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiRequestTypedData,
    SocketPacketRequestPayload,
} from '@protocol/socket-packet-payload.type';
import RoomRepository from '@repositories/room-repository';
import { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { beforeEach, vi } from 'vitest';
import { TestDatabase, useTestDatabase } from './database';

/** A packet the API posted to a websocket connection */
export interface PostedPacket {
    to: string | undefined;
    packet: unknown;
}

export interface AwsMocks {
    apiGateway: AwsClientStub<ApiGatewayManagementApiClient>;
    /** In memory (PGlite), emptied before each test */
    database: TestDatabase;
}

export const HOST_CONNECTION: string = 'host-connection';
export const GUEST_CONNECTION: string = 'guest-connection';
/** The tokens the host of `aRoom()` created it with, and its guest joined it with */
export const HOST_TOKEN: string = 'host-token';
export const GUEST_TOKEN: string = 'guest-token';

/** A room hosted by `host`, `guest` waiting in its queue */
export function aRoom(room: Partial<Room> = {}): Room {
    return {
        id: 'room',
        connectionId: HOST_CONNECTION,
        hostPlayer: 'host',
        maxPlayer: 2,
        game: RoomGame.CHESS,
        createdAt: '2026-10-11T12:00:00.000Z',
        nameKey: 'room',
        players: [{ playerName: 'host' }],
        queue: [{ playerName: 'guest', connectionId: GUEST_CONNECTION }],
        tokenHashes: { host: hashToken(HOST_TOKEN), guest: hashToken(GUEST_TOKEN) },
        isPrivate: room.passwordHash !== undefined,
        ...room,
    };
}

export function aRequest<Type extends RoomApiRequestTypeEnum>(type: Type, data: RoomSocketApiRequestTypedData[Type]): SocketPacketRequestPayload<Type> {
    return { id: 7, type, data };
}

/** The event of a websocket route, with only what the lambdas read */
export function anEvent(connectionId: string | undefined, body: string | null = null): APIGatewayProxyEvent {
    return { body, requestContext: { connectionId, domainName: 'api.test' } } as unknown as APIGatewayProxyEvent;
}

/** The event of a route of the HTTP API, with only what the lambdas read: the query string as sent, still encoded */
export function anHttpEvent(routeKey: string, rawQueryString: string = ''): APIGatewayProxyEventV2 {
    return { routeKey, rawQueryString } as unknown as APIGatewayProxyEventV2;
}

/** What a repository throws when the database fails */
export function aDatabaseFailure(operation: DatabaseOperationEnum = DatabaseOperationEnum.UPDATE): DatabaseException {
    return new DatabaseException(operation, 'The database failed');
}

export function anApiGatewayClient(): ApiGatewayManagementApiClient {
    return new ApiGatewayManagementApiClient({ endpoint: 'https://api.test', region: 'eu-west-3' });
}

/** The packets posted to the connections, in their order */
export function postedPackets(apiGateway: AwsClientStub<ApiGatewayManagementApiClient>): PostedPacket[] {
    return apiGateway.commandCalls(PostToConnectionCommand).map(({ args: [command] }: { args: [PostToConnectionCommand] }): PostedPacket => ({
        to: command.input.ConnectionId,
        packet: JSON.parse(command.input.Data as string),
    }));
}

/**
 * Mocks API Gateway in a describe block, reset before each test: it answers every command with an empty object. Gives
 * the repositories a database in memory, emptied before each test
 */
export function mockAws(): AwsMocks {
    const mocks: AwsMocks = { apiGateway: mockClient(ApiGatewayManagementApiClient), database: useTestDatabase() };

    beforeEach((): void => {
        mocks.apiGateway.reset().onAnyCommand().resolves({});
        // The handlers log their failures
        vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    });

    return mocks;
}

/** Stores the room, its players and its queue in their order, and the hashes of its tokens */
export async function storeRoom(room: Room): Promise<void> {
    await getDatabase().insert(rooms).values({
        id: room.id,
        connectionId: room.connectionId,
        hostPlayer: room.hostPlayer,
        maxPlayer: room.maxPlayer,
        game: room.game,
        createdAt: room.createdAt,
        nameKey: room.nameKey,
        passwordHash: room.passwordHash,
        expiresAt: room.expiresAt,
    });

    if (room.players.length > 0) {
        await getDatabase().insert(roomPlayers).values(room.players.map(({ playerName }: Player): typeof roomPlayers.$inferInsert => ({ roomId: room.id, playerName })));
    }

    if (room.queue.length > 0) {
        await getDatabase().insert(roomQueue).values(room.queue.map(({ playerName, connectionId }: Player): typeof roomQueue.$inferInsert => ({
            roomId: room.id,
            playerName,
            connectionId: connectionId as string,
        })));
    }

    const tokenHashes: [string, string][] = Object.entries(room.tokenHashes);
    if (tokenHashes.length > 0) {
        await getDatabase().insert(roomTokens).values(tokenHashes.map(([playerName, tokenHash]: [string, string]): typeof roomTokens.$inferInsert => ({ roomId: room.id, playerName, tokenHash })));
    }
}

/** The room as stored, null without it */
export function readRoom(roomName: string): Promise<Room | null> {
    return new RoomRepository().getByName(roomName);
}

export async function storeConnection(connection: Connection): Promise<void> {
    await getDatabase().insert(connections).values(connection);
}

/** The connections stored, by their id */
export function readConnections(): Promise<Connection[]> {
    return getDatabase().select().from(connections).orderBy(connections.connectionId);
}

/** The error a request gets in reply */
export function errorReply(message: string, to: string = HOST_CONNECTION): PostedPacket {
    return { to, packet: { id: 7, type: 'error', data: { message } } };
}
