import { useDatabase } from '@database/database';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createLocalDatabase, LocalDatabase } from '../local/local-database';

export interface TestDatabase {
    /** Set before the first test */
    db: LocalDatabase;
}

/**
 * Gives the repositories a database in memory in a describe block, with the schema of the migrations: one per spec
 * file, emptied before each test
 */
export function useTestDatabase(): TestDatabase {
    const testDatabase = {} as TestDatabase;

    beforeAll(async (): Promise<void> => {
        testDatabase.db = await createLocalDatabase();
        useDatabase(testDatabase.db);
    });

    beforeEach(async (): Promise<void> => {
        // The tables of the rooms go with them
        await testDatabase.db.execute(sql`TRUNCATE rooms, connections RESTART IDENTITY CASCADE`);
    });

    afterAll(async (): Promise<void> => {
        useDatabase(undefined);
        await testDatabase.db.$client.close();
    });

    return testDatabase;
}
