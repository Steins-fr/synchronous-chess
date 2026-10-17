/**
 * The database of the local API and the specs, without AWS: PostgreSQL in memory (PGlite, compiled to WASM), the
 * major version of the Aurora cluster. Never imported by the lambdas: esbuild.build.js refuses to bundle it
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle, PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { relations } from '@database/relations';

export type LocalDatabase = PgliteDatabase<typeof relations> & { $client: PGlite };

/** A database in memory with the schema of the migrations, like the cluster: nothing is kept once it closes */
export async function createLocalDatabase(): Promise<LocalDatabase> {
    const database: LocalDatabase = drizzle({ client: new PGlite({ extensions: { pg_trgm } }), relations });
    await migrate(database, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') });
    return database;
}
