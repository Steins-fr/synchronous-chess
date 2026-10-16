import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { aConditionFailure, aRoom } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test } from 'vitest';
import PasswordAttemptRepository from './password-attempt-repository';

describe('PasswordAttemptRepository', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    let repository: PasswordAttemptRepository;

    /** The update counting one more attempt, while the count goes on */
    const COUNT: string = 'SET attempts = if_not_exists(attempts, :zero) + :one, expiresAt = :expiresAt';
    /** The update counting the attempts again from one, once the count is over */
    const COUNT_AGAIN: string = 'SET attempts = :one, expiresAt = :expiresAt';
    /** The room of the attempts, by its name and its creation date */
    const KEY = { roomKey: 'room#2026-10-11T12:00:00.000Z', sourceHash: 'source' };

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        repository = new PasswordAttemptRepository();
    });

    test('should count an attempt of a client while it made less than the most attempts, atomically', async () => {
        // When / Then
        expect(await repository.countAttempt(aRoom(), 'source', 5, 500, 560)).toEqual(true);
        expect(dynamo.commandCalls(UpdateCommand).map(({ args: [command] }: { args: [UpdateCommand] }) => command.input)).toEqual([{
            TableName: 'password-attempt',
            Key: KEY,
            UpdateExpression: COUNT,
            ConditionExpression: 'attribute_not_exists(attempts) OR (attempts < :maxAttempts AND expiresAt > :now)',
            ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':expiresAt': 560, ':maxAttempts': 5, ':now': 500 },
            ExpressionAttributeNames: undefined,
            ReturnValues: 'NONE',
        }]);
    });

    test('should count the attempts of a room created again under the same name apart', async () => {
        // When
        await repository.countAttempt(aRoom({ createdAt: '2026-10-12T08:00:00.000Z' }), 'source', 5, 500, 560);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { Key: { roomKey: 'room#2026-10-12T08:00:00.000Z', sourceHash: 'source' } })).toHaveLength(1);
    });

    test('should count the attempts of a client again from one once its count is over', async () => {
        // Given
        dynamo.on(UpdateCommand, { UpdateExpression: COUNT }).rejects(aConditionFailure());

        // When / Then
        expect(await repository.countAttempt(aRoom(), 'source', 5, 500, 560)).toEqual(true);
        expect(dynamo.commandCalls(UpdateCommand, {
            UpdateExpression: COUNT_AGAIN,
            ConditionExpression: 'expiresAt <= :now',
            ExpressionAttributeValues: { ':one': 1, ':expiresAt': 560, ':now': 500 },
        })).toHaveLength(1);
    });

    test('should count an attempt after another one counted again from one at the same time', async () => {
        // Given: the count over, another attempt counts again from one before this one
        dynamo.on(UpdateCommand, { UpdateExpression: COUNT }).rejectsOnce(aConditionFailure()).resolves({});
        dynamo.on(UpdateCommand, { UpdateExpression: COUNT_AGAIN }).rejects(aConditionFailure());

        // When / Then
        expect(await repository.countAttempt(aRoom(), 'source', 5, 500, 560)).toEqual(true);
        expect(dynamo.commandCalls(UpdateCommand, { UpdateExpression: COUNT })).toHaveLength(2);
    });

    test('should not count an attempt of a client which made the most attempts, its count not over', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        expect(await repository.countAttempt(aRoom(), 'source', 5, 500, 560)).toEqual(false);
    });

    test('should uncount the attempt of a client, keeping the others', async () => {
        // When
        await repository.uncountAttempt(aRoom(), 'source');

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            TableName: 'password-attempt',
            Key: KEY,
            UpdateExpression: 'SET attempts = attempts - :one',
            ConditionExpression: 'attempts > :zero',
            ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
        })).toHaveLength(1);
    });

    test('should not uncount an attempt of a count deleted', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        await expect(repository.uncountAttempt(aRoom(), 'source')).resolves.toBeUndefined();
    });
});
