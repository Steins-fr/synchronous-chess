import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { handler, MIGRATIONS_FOLDER } from './app';

vi.mock('drizzle-orm/aws-data-api/pg/migrator', () => ({ migrate: vi.fn() }));

describe('migrate handler', () => {
    test('should apply the migrations of the folder next to its bundle to the cluster of the environment', async () => {
        // Given
        vi.stubEnv('DATABASE_RESOURCE_ARN', 'arn:aws:rds:eu-west-1:123456789012:cluster:sc-database-development');
        vi.stubEnv('DATABASE_SECRET_ARN', 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:sc-database-development');
        vi.stubEnv('DATABASE_NAME', 'synchronous_chess');

        // When / Then
        expect(await handler()).toEqual({ statusCode: 200, body: 'Migrated' });
        expect(migrate).toHaveBeenCalledWith(expect.anything(), { migrationsFolder: MIGRATIONS_FOLDER });
        expect(MIGRATIONS_FOLDER).toEqual(path.join(import.meta.dirname, 'drizzle'));
    });

    test('should fail when a migration fails: the deployment stops', async () => {
        // Given
        vi.stubEnv('DATABASE_RESOURCE_ARN', 'arn:aws:rds:eu-west-1:123456789012:cluster:sc-database-development');
        vi.stubEnv('DATABASE_SECRET_ARN', 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:sc-database-development');
        vi.stubEnv('DATABASE_NAME', 'synchronous_chess');
        vi.mocked(migrate).mockRejectedValueOnce(new Error('relation "rooms" already exists'));

        // When / Then
        await expect(handler()).rejects.toThrow('relation "rooms" already exists');
    });
});
