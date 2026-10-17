import { getDatabase } from '@database/database';
import { roomPasswordAttempts, rooms } from '@database/schema';
import { aRoom, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, test } from 'vitest';
import PasswordAttemptRepository from './password-attempt-repository';

// In epoch seconds
const NOW: number = 1_800_000_000;
const MAX_ATTEMPTS: number = 5;

describe('PasswordAttemptRepository', () => {
    useTestDatabase();
    let repository: PasswordAttemptRepository;

    function count(now: number = NOW, sourceHash: string = 'source'): Promise<boolean> {
        return repository.countAttempt({ id: 'room' }, sourceHash, MAX_ATTEMPTS, now, now + 60);
    }

    function attempts(): Promise<unknown[]> {
        return getDatabase().select().from(roomPasswordAttempts).orderBy(roomPasswordAttempts.sourceHash);
    }

    beforeEach(async () => {
        repository = new PasswordAttemptRepository();
        await storeRoom(aRoom({ passwordHash: 'hash' }));
    });

    test('should count the attempts of a client while it made less than the most attempts, each one pushing its count back', async () => {
        // When
        expect(await count(NOW)).toEqual(true);
        expect(await count(NOW + 10)).toEqual(true);

        // Then
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: 'source', attempts: 2, expiresAt: NOW + 70 }]);
    });

    test('should count the attempts sent at once, the most attempts at most', async () => {
        // When
        const counted: boolean[] = await Promise.all(Array.from({ length: 8 }, () => count()));

        // Then
        expect(counted.filter(Boolean)).toHaveLength(MAX_ATTEMPTS);
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: 'source', attempts: MAX_ATTEMPTS, expiresAt: NOW + 60 }]);
    });

    test('should not count an attempt of a client which made the most attempts, its count not over', async () => {
        // Given
        await getDatabase().insert(roomPasswordAttempts).values({ roomId: 'room', sourceHash: 'source', attempts: MAX_ATTEMPTS, expiresAt: NOW + 1 });

        // When / Then
        expect(await count()).toEqual(false);
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: 'source', attempts: MAX_ATTEMPTS, expiresAt: NOW + 1 }]);
    });

    test('should count the attempts of a client again from one once its count is over', async () => {
        // Given
        await getDatabase().insert(roomPasswordAttempts).values({ roomId: 'room', sourceHash: 'source', attempts: MAX_ATTEMPTS, expiresAt: NOW });

        // When / Then
        expect(await count()).toEqual(true);
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: 'source', attempts: 1, expiresAt: NOW + 60 }]);
    });

    test('should count the attempts of each client apart', async () => {
        // Given
        await getDatabase().insert(roomPasswordAttempts).values({ roomId: 'room', sourceHash: 'source', attempts: MAX_ATTEMPTS, expiresAt: NOW + 1 });

        // When / Then
        expect(await count(NOW, 'other-source')).toEqual(true);
    });

    test('should uncount the attempt of a client, keeping the others', async () => {
        // Given
        await count();
        await count();
        await count(NOW, 'other-source');

        // When
        await repository.uncountAttempt({ id: 'room' }, 'source');

        // Then
        expect(await attempts()).toEqual([
            { roomId: 'room', sourceHash: 'other-source', attempts: 1, expiresAt: NOW + 60 },
            { roomId: 'room', sourceHash: 'source', attempts: 1, expiresAt: NOW + 60 },
        ]);
    });

    test('should not uncount an attempt below none', async () => {
        // Given
        await getDatabase().insert(roomPasswordAttempts).values({ roomId: 'room', sourceHash: 'source', attempts: 0, expiresAt: NOW });

        // When
        await repository.uncountAttempt({ id: 'room' }, 'source');
        await repository.uncountAttempt({ id: 'room' }, 'unknown-source');

        // Then
        expect(await attempts()).toEqual([{ roomId: 'room', sourceHash: 'source', attempts: 0, expiresAt: NOW }]);
    });

    test('should delete the attempts with their room: a room created again under its name starts without them', async () => {
        // Given
        await count();

        // When
        await getDatabase().delete(rooms).where(eq(rooms.id, 'room'));

        // Then
        expect(await attempts()).toEqual([]);
    });
});
