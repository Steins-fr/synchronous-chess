import {
    BeginTransactionCommand,
    CommitTransactionCommand,
    DatabaseResumingException,
    ExecuteStatementCommand,
    RDSDataClient,
} from '@aws-sdk/client-rds-data';
import { eq } from 'drizzle-orm';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDataApiDatabase, DataApiDatabase } from './data-api-database';
import { connections } from './schema';

const CLUSTER = {
    resourceArn: 'arn:aws:rds:eu-west-1:123456789012:cluster:sc-dev',
    secretArn: 'arn:aws:secretsmanager:eu-west-1:123456789012:secret:sc-dev',
    database: 'synchronous_chess',
};

function aResumingException(): DatabaseResumingException {
    return new DatabaseResumingException({ $metadata: {}, message: 'The Aurora DB instance is resuming after being auto-paused' });
}

describe('createDataApiDatabase', () => {
    const rdsData = mockClient(RDSDataClient);
    let db: DataApiDatabase;

    beforeEach(() => {
        rdsData.reset().onAnyCommand().resolves({});
        vi.stubEnv('DATABASE_RESOURCE_ARN', CLUSTER.resourceArn);
        vi.stubEnv('DATABASE_SECRET_ARN', CLUSTER.secretArn);
        vi.stubEnv('DATABASE_NAME', CLUSTER.database);
        // Built once the client is mocked: it wraps its send
        db = createDataApiDatabase();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should run the statements on the cluster of the environment, and read their records', async () => {
        // Given
        rdsData.on(ExecuteStatementCommand).resolves({
            columnMetadata: [{ name: 'connection_id' }, { name: 'room_name' }],
            records: [[{ stringValue: 'connection' }, { stringValue: 'room' }]],
        });

        // When
        const rows = await db.select().from(connections).where(eq(connections.connectionId, 'connection'));

        // Then
        expect(rows).toEqual([{ connectionId: 'connection', roomName: 'room' }]);
        expect(rdsData.commandCalls(ExecuteStatementCommand)[0]?.args[0].input).toEqual(expect.objectContaining({
            ...CLUSTER,
            parameters: [{ name: '1', value: { stringValue: 'connection' } }],
        }));
    });

    test('should run a statement once the paused cluster resumed', async () => {
        // Given
        vi.useFakeTimers();
        rdsData.on(ExecuteStatementCommand).rejectsOnce(aResumingException()).resolves({ numberOfRecordsUpdated: 1 });

        // When
        const deletion: Promise<unknown> = db.delete(connections).where(eq(connections.connectionId, 'connection')).execute();
        await vi.runAllTimersAsync();
        await deletion;

        // Then
        expect(rdsData.commandCalls(ExecuteStatementCommand)).toHaveLength(2);
    });

    test('should start a transaction once the paused cluster resumed', async () => {
        // Given
        vi.useFakeTimers();
        rdsData.on(BeginTransactionCommand).rejectsOnce(aResumingException()).resolves({ transactionId: 'transaction' });

        // When
        const transaction: Promise<void> = db.transaction((): Promise<void> => Promise.resolve());
        await vi.runAllTimersAsync();
        await transaction;

        // Then
        expect(rdsData.commandCalls(BeginTransactionCommand)).toHaveLength(2);
        expect(rdsData.commandCalls(CommitTransactionCommand)[0]?.args[0].input).toEqual(expect.objectContaining({ transactionId: 'transaction' }));
    });

    test('should fail at once without the cluster in the environment', () => {
        // Given
        vi.stubEnv('DATABASE_RESOURCE_ARN', undefined);

        // When / Then
        expect(createDataApiDatabase).toThrow('No DATABASE_RESOURCE_ARN');
    });
});
