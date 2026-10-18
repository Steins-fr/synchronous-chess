import { getDatabase } from '@database/database';
import { useTestDatabase } from '@testing/database';
import { describe, expect, test, vi } from 'vitest';
import HealthRepository from './health-repository';

describe('HealthRepository', () => {
    useTestDatabase();

    test('should resolve once the database answers', async () => {
        await expect(new HealthRepository().ping()).resolves.toBeUndefined();
    });

    test('should report a failure of the database', async () => {
        // Given
        const failure: Error = new Error('The database failed');
        vi.spyOn(getDatabase(), 'execute').mockRejectedValue(failure);

        // When / Then
        await expect(new HealthRepository().ping()).rejects.toBe(failure);
    });
});
