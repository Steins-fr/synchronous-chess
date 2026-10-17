import { PgAsyncDatabase, PgAsyncTransaction, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { createDataApiDatabase } from './data-api-database';
import { relations } from './relations';

/** The database of the repositories, whatever runs it: Aurora on AWS, PGlite in the local API and the specs */
export type Database = PgAsyncDatabase<PgQueryResultHKT, typeof relations>;

export type DatabaseTransaction = PgAsyncTransaction<PgQueryResultHKT, typeof relations>;

let database: Database | undefined;

/**
 * The database the repositories read and write: the Aurora cluster of the environment, built at the first call,
 * unless another one was given before
 * @throws {Error} when the environment does not give the cluster, and no other database was given
 */
export function getDatabase(): Database {
    database ??= createDataApiDatabase();
    return database;
}

/**
 * Gives the repositories the database to use from now on: the local API and the specs give theirs, in memory, before
 * the lambdas run
 */
export function useDatabase(newDatabase: Database | undefined): void {
    database = newDatabase;
}
