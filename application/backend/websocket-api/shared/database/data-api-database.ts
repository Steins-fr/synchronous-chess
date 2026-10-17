import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { AwsDataApiPgDatabase, drizzle } from 'drizzle-orm/aws-data-api/pg';
import { getDatabaseName, getDatabaseResourceArn, getDatabaseSecretArn } from '@helpers/environment.helper';
import { relations } from './relations';
import { retryOnResume } from './resume-retry';

export type DataApiDatabase = AwsDataApiPgDatabase<typeof relations>;

/**
 * The database of the lambdas: the Aurora cluster of the environment, reached through its Data API (HTTPS, no
 * connection to keep: the cluster pauses once nobody plays)
 * @throws {Error} when the environment does not give the cluster
 */
export function createDataApiDatabase(): DataApiDatabase {
    const client: RDSDataClient = new RDSDataClient({});
    const send: RDSDataClient['send'] = client.send.bind(client);
    // Drizzle sends every statement, and the start and end of each transaction, through it: they all wait for the
    // paused cluster to resume
    client.send = ((command: Parameters<RDSDataClient['send']>[0]): Promise<unknown> => retryOnResume((): Promise<unknown> => send(command))) as RDSDataClient['send'];

    return drizzle({
        client,
        resourceArn: getDatabaseResourceArn(),
        secretArn: getDatabaseSecretArn(),
        database: getDatabaseName(),
        relations,
    });
}
