import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import DynamoException, { DynamoCrudActionEnum } from '@exceptions/dynamo-exception';
import Connection from '@models/connection';
import { aDynamoError } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test } from 'vitest';
import ConnectionRepository from './connection-repository';

// Tested through the connection repository, its simplest subclass
describe('BaseRepository', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    const connection: Connection = { connectionId: 'connection', roomName: 'room' };
    let repository: ConnectionRepository;

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        repository = new ConnectionRepository();
    });

    test('should put an item in its table', async () => {
        // When
        const item: Connection = await repository.put(connection);

        // Then
        expect(item).toBe(connection);
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connections', Item: connection, ReturnValues: 'NONE' })).toHaveLength(1);
    });

    test('should delete an item by its key', async () => {
        // When
        await repository.delete(connection);

        // Then
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'connections', Key: { connectionId: 'connection' } })).toHaveLength(1);
    });

    test('should find an item by its key, with the projection of the repository', async () => {
        // Given
        dynamo.on(GetCommand).resolves({ Item: connection });

        // When
        const item: Connection | null = await repository.find({ connectionId: 'connection' });

        // Then
        expect(item).toEqual(connection);
        expect(dynamo.commandCalls(GetCommand, {
            TableName: 'connections',
            Key: { connectionId: 'connection' },
            ProjectionExpression: 'connectionId, roomName',
        })).toHaveLength(1);
    });

    test('should find no item', async () => {
        // Given
        dynamo.on(GetCommand).resolves({});

        // When / Then
        expect(await repository.find({ connectionId: 'unknown' })).toBeNull();
    });

    test('should update an item and return its new attributes', async () => {
        // Given
        const updated: Connection = { ...connection, roomName: 'other' };
        dynamo.on(UpdateCommand).resolves({ Attributes: updated });

        // When
        const item: Connection = await repository.updateItem(connection, 'set roomName = :roomName', { ':roomName': 'other' });

        // Then
        expect(item).toEqual(updated);
        expect(dynamo.commandCalls(UpdateCommand, {
            TableName: 'connections',
            Key: { connectionId: 'connection' },
            UpdateExpression: 'set roomName = :roomName',
            ExpressionAttributeValues: { ':roomName': 'other' },
            ReturnValues: 'ALL_NEW',
        })).toHaveLength(1);
    });

    const operations: [DynamoCrudActionEnum, () => Promise<unknown>][] = [
        [DynamoCrudActionEnum.PUT, () => repository.put(connection)],
        [DynamoCrudActionEnum.DELETE, () => repository.delete(connection)],
        [DynamoCrudActionEnum.GET, () => repository.find(connection)],
        [DynamoCrudActionEnum.UPDATE, () => repository.updateItem(connection, 'set roomName = :roomName')],
    ];

    test.each(operations)('should report the DynamoDB failure of a %s', async (action: DynamoCrudActionEnum, operation: () => Promise<unknown>) => {
        // Given
        dynamo.onAnyCommand().rejects(aDynamoError());

        // When / Then
        await expect(operation()).rejects.toEqual(expect.objectContaining({ action, message: 'DynamoDB failed' }));
        await expect(operation()).rejects.toBeInstanceOf(DynamoException);
    });

    test.each(operations)('should rethrow another failure of a %s', async (_action: DynamoCrudActionEnum, operation: () => Promise<unknown>) => {
        // Given
        const error: Error = new Error('Network down');
        dynamo.onAnyCommand().rejects(error);

        // When / Then
        await expect(operation()).rejects.toBe(error);
    });
});
