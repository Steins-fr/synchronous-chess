import { DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Connection from '@models/connection';
import { aRoom, AwsMocks, anEvent, GUEST_CONNECTION, HOST_CONNECTION, mockAws, storeRoom } from '@testing/api-mocks';
import { describe, expect, test } from 'vitest';
import { handler } from './app';

describe('ondisconnect lambda', () => {
    const { dynamo }: AwsMocks = mockAws();

    function storeConnection(connection: Partial<Connection>): void {
        dynamo.on(GetCommand, { TableName: 'connections' }).resolves({ Item: connection });
    }

    test('should remove a disconnected guest from the queue, then its connection', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(dynamo.commandCalls(UpdateCommand, { TableName: 'rooms', UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connections', Key: { connectionId: GUEST_CONNECTION } })).toHaveLength(1);
    });

    test('should let the room of a disconnected host wait for it', async () => {
        // Given
        storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });
        storeRoom(dynamo, aRoom());

        // When
        const response = await handler(anEvent(HOST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(dynamo.commandCalls(UpdateCommand, { TableName: 'rooms', UpdateExpression: 'SET expiresAt = :expiresAt' })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'rooms' })).toHaveLength(0);
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connections', Key: { connectionId: HOST_CONNECTION } })).toHaveLength(1);
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
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connections', Key: { connectionId: 'former-host-connection' } })).toHaveLength(1);
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
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connections' })).toHaveLength(1);
    });

    test('should fail without the room of the connection', async () => {
        // Given
        storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'missing' });

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 500, body: 'Internal server error' });
        expect(dynamo.commandCalls(DeleteCommand)).toHaveLength(0);
    });

    test('should fail without connection id', async () => {
        expect(await handler(anEvent(undefined))).toEqual({ statusCode: 500, body: 'Undefined connection' });
    });

    test.each([
        ['an unknown connection', undefined],
        ['a connection stored without id', { roomName: 'room' }],
    ])('should fail for %s', async (_case: string, connection: Partial<Connection> | undefined) => {
        // Given
        dynamo.on(GetCommand, { TableName: 'connections' }).resolves({ Item: connection });

        // When / Then
        expect(await handler(anEvent(GUEST_CONNECTION))).toEqual({ statusCode: 500, body: 'Undefined connection' });
    });
});
