/**
 * What the wake of the database did, returned by its lambda: shown by an invocation by hand (aws lambda invoke). Lambda
 * logs no response of the invocations of the schedule
 */
export enum DatabaseWake {
    SKIPPED = 'Skipped',
    WOKEN = 'Woken',
}
