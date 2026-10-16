import { DeleteCommand, DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '@helpers/password.helper';
import { hashSource } from '@helpers/source.helper';
import Room from '@models/room';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { aConditionFailure, aRoom, GUEST_TOKEN } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RoomPasswordService from './room-password-service';

describe('RoomPasswordService', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    let service: RoomPasswordService;
    let room: Room;

    // In epoch seconds
    const now: number = 1_800_000_000;
    // The IP of the client joining
    const ip: string = '203.0.113.7';

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        vi.useFakeTimers({ now: now * 1000 });
        service = new RoomPasswordService();
        room = aRoom();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should let a player join a private room with its password only, each valid password counted before being checked', async () => {
        // Given
        const privateRoom: Room = aRoom({ passwordHash: hashPassword('secret') });
        const joining = (password: string | undefined): Pick<RoomJoinRequest, 'playerName' | 'password' | 'token'> => ({ playerName: 'other', password, token: 'other-token' });
        const attemptKey = { roomKey: 'room#2026-10-11T12:00:00.000Z', sourceHash: hashSource(ip) };

        // When / Then
        await expect(service.passwordGuard(room, joining(undefined), ip)).resolves.toBeUndefined();
        await expect(service.passwordGuard(room, joining('any'), ip)).resolves.toBeUndefined();
        expect(dynamo.calls()).toHaveLength(0);
        // Never the right one: not counted, a room listed as public may have become private
        await expect(service.passwordGuard(privateRoom, joining(undefined), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        await expect(service.passwordGuard(privateRoom, joining('short'), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        await expect(service.passwordGuard(privateRoom, joining(42 as unknown as string), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(dynamo.calls()).toHaveLength(0);
        await expect(service.passwordGuard(privateRoom, joining('wrong-password'), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        await expect(service.passwordGuard(privateRoom, joining('secret'), ip)).resolves.toBeUndefined();
        expect(dynamo.commandCalls(UpdateCommand, {
            TableName: 'password-attempt',
            Key: attemptKey,
            ExpressionAttributeValues: { ':maxAttempts': RoomPasswordService.MAX_PASSWORD_ATTEMPTS, ':now': now, ':zero': 0, ':one': 1, ':expiresAt': now + 60 },
        })).toHaveLength(2);
        // The right one only is not counted: the wrong ones stay
        expect(dynamo.commandCalls(UpdateCommand, { Key: attemptKey, UpdateExpression: 'SET attempts = attempts - :one' })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand)).toHaveLength(0);
    });

    test('should let a player of a private room join it again without its password, by its token', async () => {
        // Given: its passwords refused
        dynamo.on(UpdateCommand).rejects(aConditionFailure());
        const privateRoom: Room = aRoom({ passwordHash: hashPassword('secret') });

        // When / Then
        await expect(service.passwordGuard(privateRoom, { playerName: 'guest', token: GUEST_TOKEN }, ip)).resolves.toBeUndefined();
        await expect(service.passwordGuard(privateRoom, { playerName: 'guest', password: 'secret', token: 'other-token' }, ip)).rejects.toThrow(RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(3);
    });

    test('should refuse the passwords of a client without checking them, once it gave too many', async () => {
        // Given: the count of the client reached, not over
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then: even its right password
        await expect(service.passwordGuard(aRoom({ passwordHash: hashPassword('secret') }), { playerName: 'other', password: 'secret', token: 'other-token' }, ip))
            .rejects.toThrow(RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
        expect(dynamo.commandCalls(UpdateCommand, { UpdateExpression: 'SET attempts = attempts - :one' })).toHaveLength(0);
    });
});
