import { DeleteCommand, DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { aConditionFailure } from '@testing/api-mocks';
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

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        repository = new PasswordAttemptRepository();
    });

    test('should count an attempt of a client while it made less than the most attempts, atomically', async () => {
        // When / Then
        expect(await repository.countAttempt('room', 'source', 5, 500, 560)).toEqual(true);
        expect(dynamo.commandCalls(UpdateCommand).map(({ args: [command] }: { args: [UpdateCommand] }) => command.input)).toEqual([{
            TableName: 'password-attempt',
            Key: { roomName: 'room', sourceHash: 'source' },
            UpdateExpression: COUNT,
            ConditionExpression: 'attribute_not_exists(attempts) OR (attempts < :maxAttempts AND expiresAt > :now)',
            ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':expiresAt': 560, ':maxAttempts': 5, ':now': 500 },
            ExpressionAttributeNames: undefined,
            ReturnValues: 'NONE',
        }]);
    });

    test('should count the attempts of a client again from one once its count is over', async () => {
        // Given
        dynamo.on(UpdateCommand, { UpdateExpression: COUNT }).rejects(aConditionFailure());

        // When / Then
        expect(await repository.countAttempt('room', 'source', 5, 500, 560)).toEqual(true);
        expect(dynamo.commandCalls(UpdateCommand, {
            UpdateExpression: COUNT_AGAIN,
            ConditionExpression: 'expiresAt <= :now',
            ExpressionAttributeValues: { ':one': 1, ':expiresAt': 560, ':now': 500 },
        })).toHaveLength(1);
    });

    test('should not count an attempt of a client which made the most attempts, its count not over', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        expect(await repository.countAttempt('room', 'source', 5, 500, 560)).toEqual(false);
    });

    test('should forget the attempts of a client', async () => {
        // When
        await repository.forgetAttempts('room', 'source');

        // Then
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'password-attempt', Key: { roomName: 'room', sourceHash: 'source' } })).toHaveLength(1);
    });
});
