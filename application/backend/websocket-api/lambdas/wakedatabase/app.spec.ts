import { DatabaseOperationEnum } from '@exceptions/database-exception';
import HealthRepository from '@repositories/health-repository';
import { aDatabaseFailure } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AWAKE_WINDOW_MS, handler } from './app';
import { wasAwakeSince } from './database-activity';
import { DatabaseWake } from './database-wake.enum';

vi.mock('./database-activity', () => ({ wasAwakeSince: vi.fn() }));

const NOW = new Date('2026-10-20T12:00:00.000Z');

describe('wakedatabase handler', () => {
    useTestDatabase();

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
        vi.spyOn(console, 'log').mockImplementation((): void => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should leave asleep a database which ran within the last 8 hours', async () => {
        // Given
        vi.mocked(wasAwakeSince).mockResolvedValue(true);
        const ping = vi.spyOn(HealthRepository.prototype, 'ping');

        // When
        const wake: DatabaseWake = await handler();

        // Then
        expect(wake).toEqual(DatabaseWake.SKIPPED);
        expect(wasAwakeSince).toHaveBeenCalledExactlyOnceWith(new Date('2026-10-20T04:00:00.000Z'));
        expect(ping).not.toHaveBeenCalled();
    });

    test('should wake a database which did not run within the last 8 hours', async () => {
        // Given
        vi.mocked(wasAwakeSince).mockResolvedValue(false);
        const ping = vi.spyOn(HealthRepository.prototype, 'ping');

        // When
        const wake: DatabaseWake = await handler();

        // Then
        expect(wake).toEqual(DatabaseWake.WOKEN);
        expect(wasAwakeSince).toHaveBeenCalledExactlyOnceWith(new Date(NOW.getTime() - AWAKE_WINDOW_MS));
        expect(ping).toHaveBeenCalledOnce();
    });

    test('should fail while the database fails, or still resumes: Lambda invokes it again', async () => {
        // Given
        vi.mocked(wasAwakeSince).mockResolvedValue(false);
        const failure = aDatabaseFailure(DatabaseOperationEnum.QUERY);
        vi.spyOn(HealthRepository.prototype, 'ping').mockRejectedValue(failure);

        // When / Then
        await expect(handler()).rejects.toBe(failure);
    });
});
