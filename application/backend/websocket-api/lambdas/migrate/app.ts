import { createDataApiDatabase } from '@database/data-api-database';
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
import path from 'node:path';

interface Response {
    statusCode: number;
    body: string;
}

/** The migrations of the drizzle folder, copied next to the bundle by esbuild.build.js */
export const MIGRATIONS_FOLDER: string = path.resolve(import.meta.dirname, 'drizzle');

/**
 * Applies the migrations the database misses, in one transaction: invoked by Terraform each time the migrations change,
 * before the other lambdas are deployed. Its failure fails the deployment
 */
export const handler = async function (): Promise<Response> {
    await migrate(createDataApiDatabase(), { migrationsFolder: MIGRATIONS_FOLDER });
    return { statusCode: 200, body: 'Migrated' };
};
