import { DatabaseOperationEnum } from '@exceptions/database-exception';
import HealthRepository from '@repositories/health-repository';
import { aDatabaseFailure } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { describe, expect, test, vi } from 'vitest';
import { healthHandler } from './health-handler';

describe('healthHandler', () => {
    useTestDatabase();

    test('should tell the API is up once the database answers', async () => {
        expect(await healthHandler()).toEqual({ status: 'up' });
    });

    test('should fail while the database fails', async () => {
        // Given
        const failure = aDatabaseFailure(DatabaseOperationEnum.QUERY);
        vi.spyOn(HealthRepository.prototype, 'ping').mockRejectedValue(failure);

        // When / Then
        await expect(healthHandler()).rejects.toBe(failure);
    });
});
