import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import Connection from '@models/connection';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test } from 'vitest';
import ConnectionService from './connection-service';

describe('ConnectionService', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    const connection: Connection = { connectionId: 'connection', roomName: 'room' };
    let service: ConnectionService;

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        service = new ConnectionService();
    });

    test('should create, get and delete a connection', async () => {
        // Given
        dynamo.on(GetCommand).resolves({ Item: connection });

        // When
        await service.create(connection);
        const found: Connection | null = await service.get('connection');
        await service.delete(connection);

        // Then
        expect(found).toEqual(connection);
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connections', Item: connection })).toHaveLength(1);
        expect(dynamo.commandCalls(GetCommand, { Key: { connectionId: 'connection' } })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand, { Key: { connectionId: 'connection' } })).toHaveLength(1);
    });
});
