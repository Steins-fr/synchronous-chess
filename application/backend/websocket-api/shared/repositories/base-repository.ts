import { RDSDataServiceException } from '@aws-sdk/client-rds-data';
import { Database, getDatabase } from '@database/database';
import DatabaseException, { DatabaseOperationEnum } from '@exceptions/database-exception';
import { DrizzleQueryError } from 'drizzle-orm';

export default abstract class BaseRepository {
    /** The database of the lambdas, or the one the local API and the specs gave: read at each statement */
    protected get db(): Database {
        return getDatabase();
    }

    /**
     * Runs the statements of an operation, a failure of the database reported as a DatabaseException of the operation:
     * Drizzle wraps the failure of a statement, the Data API fails the start or end of a transaction itself. Never with
     * the message of Drizzle, which holds the parameters of the statement (hashes of tokens, of IPs)
     */
    protected async run<Output>(operation: DatabaseOperationEnum, statements: () => Promise<Output>): Promise<Output> {
        try {
            return await statements();
        } catch (err) {
            if (err instanceof DrizzleQueryError) {
                throw new DatabaseException(operation, err.cause?.message ?? 'The statement failed', { cause: err.cause });
            }

            if (err instanceof RDSDataServiceException) {
                throw new DatabaseException(operation, err.message, { cause: err });
            }

            throw err;
        }
    }

    /**
     * Whether a conditional write wrote, from the rows it returned: the Data API tells no SQL state, and the drivers
     * count the rows written each their own way
     */
    protected static written(rows: readonly unknown[]): boolean {
        return rows.length > 0;
    }
}
