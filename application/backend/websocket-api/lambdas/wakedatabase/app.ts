import HealthRepository from '@repositories/health-repository';
import { wasAwakeSince } from './database-activity';
import { DatabaseWake } from './database-wake.enum';

/**
 * A database which ran within these 8 hours is left asleep: the next wake comes 12 hours later (the schedule of
 * infrastructure/main.tf), so it never pauses for more than 20 hours
 */
export const AWAKE_WINDOW_MS: number = 8 * 60 * 60 * 1000;

const healthRepository: HealthRepository = new HealthRepository();

/**
 * Keeps the database out of its deep sleep, invoked every 12 hours by EventBridge: after 24 hours paused, Aurora puts it
 * into a deeper sleep, whose resume outlasts the retries of the other lambdas (resume-retry.ts). Wakes it with a statement
 * reading nothing, unless it ran within the 8 last hours: a database where people play is never woken for nothing
 * @throws {DatabaseException} when the database fails, or still resumes after the retries: Lambda invokes it again, a
 * minute then two minutes later, and finds it awake
 */
export const handler = async function (): Promise<DatabaseWake> {
    if (await wasAwakeSince(new Date(Date.now() - AWAKE_WINDOW_MS))) {
        console.log('The database ran within the last 8 hours: left asleep');
        return DatabaseWake.SKIPPED;
    }

    await healthRepository.ping();
    console.log('The database woke');
    return DatabaseWake.WOKEN;
};
