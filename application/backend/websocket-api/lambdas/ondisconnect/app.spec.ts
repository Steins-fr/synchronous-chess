import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Connection from '@models/connection';
import Room from '@models/room';
import { aRoom, AwsMocks, anEvent, GUEST_CONNECTION, HOST_CONNECTION, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { describe, expect, test } from 'vitest';
import { handler } from './app';

describe('ondisconnect lambda', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();

    function storeConnection(connection: Partial<Connection>): void {
        dynamo.on(GetCommand, { TableName: 'connection' }).resolves({ Item: connection });
    }

    test('should remove a disconnected guest from the queue, then its connection', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(dynamo.commandCalls(UpdateCommand, { TableName: 'room', UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connection', Key: { connectionId: GUEST_CONNECTION } })).toHaveLength(1);
    });

    test('should tell the host a guest waiting to join left, before the guest leaves the queue', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());
        const steps: string[] = [];
        apiGateway.on(PostToConnectionCommand).callsFake(() => steps.push('notified'));
        dynamo.on(UpdateCommand, { TableName: 'room' }).callsFake(() => steps.push('removed'));

        // When
        await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { type: 'joinCancelled', data: { playerName: 'guest' } } }]);
        expect(steps).toEqual(['notified', 'removed']);
    });

    test.each([
        ['a player of the room, which closed its socket once connected', aRoom({ players: [{ playerName: 'host' }, { playerName: 'guest' }] })],
        ['a guest of a room waiting for its host', aRoom({ expiresAt: Math.floor(Date.now() / 1000) + 600 })],
    ])('should not tell the host of %s', async (_case: string, room: Room) => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, room);

        // When
        await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(postedPackets(apiGateway)).toEqual([]);
        expect(dynamo.commandCalls(UpdateCommand, { TableName: 'room', UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
    });

    test('should remove the guest from the queue even when the host can not be told', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());
        const failure: Error = new Error('Gone');
        apiGateway.on(PostToConnectionCommand).rejects(failure);

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(console.error).toHaveBeenCalledWith(failure);
        expect(dynamo.commandCalls(UpdateCommand, { TableName: 'room', UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
    });

    test('should let the room of a disconnected host wait for it', async () => {
        // Given
        storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());

        // When
        const response = await handler(anEvent(HOST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(dynamo.commandCalls(UpdateCommand, { TableName: 'room', UpdateExpression: 'SET expiresAt = :expiresAt' })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'room' })).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([]);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connection', Key: { connectionId: HOST_CONNECTION } })).toHaveLength(1);
    });

    test('should only delete a connection the room no longer has', async () => {
        // Given: a former connection of the host, which reconnected the room to another one
        storeConnection({ connectionId: 'former-host-connection', roomName: 'room' });
        storeRoom(dynamo, aRoom());

        // When
        const response = await handler(anEvent('former-host-connection'));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connection', Key: { connectionId: 'former-host-connection' } })).toHaveLength(1);
    });

    test('should delete the connection even when it can not leave its room', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());
        dynamo.on(UpdateCommand).rejects(new Error('Network down'));

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(console.error).toHaveBeenCalled();
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connection' })).toHaveLength(1);
    });

    test('should delete the connection of a room which no longer exists, or expired', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'missing' });

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connection', Key: { connectionId: GUEST_CONNECTION } })).toHaveLength(1);
    });

    test('should fail when the connection can not be deleted', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());
        dynamo.on(DeleteCommand).rejects(new Error('Network down'));

        // When / Then
        expect(await handler(anEvent(GUEST_CONNECTION))).toEqual({ statusCode: 500, body: 'Internal server error' });
    });

    test('should fail without connection id', async () => {
        expect(await handler(anEvent(undefined))).toEqual({ statusCode: 500, body: 'Undefined connection' });
    });

    test.each([
        ['an unknown connection', undefined],
        ['a connection stored without id', { roomName: 'room' }],
    ])('should fail for %s', async (_case: string, connection: Partial<Connection> | undefined) => {
        // Given
        dynamo.on(GetCommand, { TableName: 'connection' }).resolves({ Item: connection });

        // When / Then
        expect(await handler(anEvent(GUEST_CONNECTION))).toEqual({ statusCode: 500, body: 'Undefined connection' });
    });
});
