import { getDatabase } from '@database/database';
import { roomPasswordAttempts } from '@database/schema';
import { hashPassword } from '@helpers/password.helper';
import { hashSource } from '@helpers/source.helper';
import Room from '@models/room';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { aRoom, GUEST_TOKEN, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RoomPasswordService from './room-password-service';

describe('RoomPasswordService', () => {
    useTestDatabase();
    let service: RoomPasswordService;
    let room: Room;
    let privateRoom: Room;

    // In epoch seconds
    const now: number = 1_800_000_000;
    // The IP of the client joining
    const ip: string = '203.0.113.7';

    /** The attempts counted of the clients */
    function attempts(): Promise<unknown[]> {
        return getDatabase().select().from(roomPasswordAttempts).orderBy(roomPasswordAttempts.sourceHash);
    }

    /** The client gave the most passwords in a row, its count not over */
    async function refusePasswords(): Promise<void> {
        await getDatabase().insert(roomPasswordAttempts).values({
            roomId: 'room',
            sourceHash: hashSource(ip),
            attempts: RoomPasswordService.MAX_PASSWORD_ATTEMPTS,
            expiresAt: now + 1,
        });
    }

    beforeEach(async () => {
        // Date only: PGlite waits on the timers
        vi.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
        service = new RoomPasswordService();
        room = aRoom();
        privateRoom = aRoom({ passwordHash: hashPassword('secret') });
        await storeRoom(privateRoom);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should let a player join a private room with its password only, each valid password counted before being checked', async () => {
        // Given
        const joining = (password: string | undefined): Pick<RoomJoinRequest, 'playerName' | 'password' | 'token'> => ({ playerName: 'other', password, token: 'other-token' });

        // When / Then
        await expect(service.passwordGuard(room, joining(undefined), ip)).resolves.toBeUndefined();
        await expect(service.passwordGuard(room, joining('any'), ip)).resolves.toBeUndefined();
        expect(await attempts()).toEqual([]);
        // Never the right one: not counted, a room listed as public may have become private
        await expect(service.passwordGuard(privateRoom, joining(undefined), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        await expect(service.passwordGuard(privateRoom, joining('short'), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        await expect(service.passwordGuard(privateRoom, joining(42 as unknown as string), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(await attempts()).toEqual([]);
        await expect(service.passwordGuard(privateRoom, joining('wrong-password'), ip)).rejects.toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: hashSource(ip), attempts: 1, expiresAt: now + 60 }]);
        vi.setSystemTime((now + 10) * 1000);
        await expect(service.passwordGuard(privateRoom, joining('secret'), ip)).resolves.toBeUndefined();
        // Counted, pushing the count back, then the right one only is not counted: the wrong ones stay
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: hashSource(ip), attempts: 1, expiresAt: now + 70 }]);
    });

    test('should let a player of a private room join it again without its password, by its token', async () => {
        // Given: its passwords refused
        await refusePasswords();

        // When / Then
        await expect(service.passwordGuard(privateRoom, { playerName: 'guest', token: GUEST_TOKEN }, ip)).resolves.toBeUndefined();
        await expect(service.passwordGuard(privateRoom, { playerName: 'guest', password: 'secret', token: 'other-token' }, ip)).rejects.toThrow(RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: hashSource(ip), attempts: RoomPasswordService.MAX_PASSWORD_ATTEMPTS, expiresAt: now + 1 }]);
    });

    test('should refuse the passwords of a client without checking them, once it gave too many', async () => {
        // Given: the count of the client reached, not over
        await refusePasswords();

        // When / Then: even its right password
        await expect(service.passwordGuard(privateRoom, { playerName: 'other', password: 'secret', token: 'other-token' }, ip))
            .rejects.toThrow(RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: hashSource(ip), attempts: RoomPasswordService.MAX_PASSWORD_ATTEMPTS, expiresAt: now + 1 }]);
    });
});
