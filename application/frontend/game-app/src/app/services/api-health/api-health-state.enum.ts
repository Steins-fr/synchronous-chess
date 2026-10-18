/** Where the check of the APIs is: the pages using them wait for it */
export enum ApiHealthState {
    /** Not checking: the APIs answered the last check, or none was asked */
    IDLE = 'idle',
    /** Asking the APIs whether they are up */
    CHECKING = 'checking',
    /** Long to answer, or failed: the APIs are booting, their paused database resuming */
    BOOTING = 'booting',
}
