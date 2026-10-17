import { afterEach, describe, expect, test, vi } from 'vitest';
import { Database, getDatabase, useDatabase } from './database';

describe('getDatabase', () => {
    afterEach(() => {
        useDatabase(undefined);
    });

    test('should build the database of the cluster of the environment once', () => {
        // Given
        vi.stubEnv('DATABASE_RESOURCE_ARN', 'arn:aws:rds:eu-west-1:123456789012:cluster:sc-dev');
        vi.stubEnv('DATABASE_SECRET_ARN', 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:sc-dev');
        vi.stubEnv('DATABASE_NAME', 'synchronous_chess');

        // When
        const database: Database = getDatabase();

        // Then
        expect(getDatabase()).toBe(database);
    });

    test('should give the database given before', () => {
        // Given
        const database = {} as Database;
        useDatabase(database);

        // When / Then
        expect(getDatabase()).toBe(database);
    });
});
