/** What the wake of the database did, returned by its lambda for its logs: the schedule invoking it reads nothing */
export enum DatabaseWake {
    SKIPPED = 'Skipped',
    WOKEN = 'Woken',
}
