import { DatabaseOperationEnum } from '@exceptions/database-exception';
import { sql } from 'drizzle-orm';
import BaseRepository from './base-repository';

/** Whether the database answers */
export default class HealthRepository extends BaseRepository {
    /**
     * Runs a statement reading nothing: resolved once the database answers, a paused cluster resumed (the Data API
     * refuses the statements while it resumes, sent again meanwhile: resume-retry.ts)
     * @throws {DatabaseException} when the database fails, or is still resuming after the waits
     */
    public async ping(): Promise<void> {
        await this.run(DatabaseOperationEnum.QUERY, (): Promise<unknown> => this.db.execute(sql`SELECT 1`));
    }
}
