/** The lock of a player in a room, held by the tab holding the room under that name */
export interface RoomLock {
    release(): void;
}

/** The locks of the players in the rooms, among the tabs of the browser */
export class RoomLocks {
    /** Without the locks of the browser, the tab holds the lock as if alone */
    private static readonly FREE_LOCK: RoomLock = { release: () => undefined };

    /**
     * Holds the lock of a player in a room, among the tabs of the browser, until released or the tab leaves (a reload, a
     * close): a duplicated tab, its session storage copied, finds it held, and asks another name
     * @param wait how long to wait for the lock, not at all by default: the page reloaded may release it after the new one
     * loaded
     * @returns the lock held, undefined when another tab holds it
     */
    public static hold(roomId: string, playerName: string, wait: number = 0): Promise<RoomLock | undefined> {
        const locks: LockManager | undefined = globalThis.navigator.locks as LockManager | undefined;

        if (locks === undefined) {
            return Promise.resolve(RoomLocks.FREE_LOCK);
        }

        const options: LockOptions = wait === 0 ? { ifAvailable: true } : { signal: AbortSignal.timeout(wait) };

        return new Promise<RoomLock | undefined>((resolve: (lock: RoomLock | undefined) => void) => {
            locks.request(RoomLocks.lockName(roomId, playerName), options, (lock: Lock | null) => {
                if (lock === null) { // Not available at once
                    resolve(undefined);
                    return undefined;
                }

                return new Promise<void>((release: () => void) => {
                    resolve({ release });
                });
            }).catch(() => {
                // Not before the wait: no lock to hold (a document without origin), the tab holds it as if alone
                resolve(options.signal?.aborted ? undefined : RoomLocks.FREE_LOCK);
            });
        });
    }

    /** Whether a tab of the browser holds the room under the name: the player is in the room already */
    public static async isHeld(roomId: string, playerName: string): Promise<boolean> {
        const locks: LockManager | undefined = globalThis.navigator.locks as LockManager | undefined;
        const name: string = RoomLocks.lockName(roomId, playerName);

        try {
            return (await locks?.query())?.held?.some((lock: LockInfo) => lock.name === name) ?? false;
        } catch {
            // Without locks to read (a document without origin): not told
            return false;
        }
    }

    private static lockName(roomId: string, playerName: string): string {
        return `synchronous-chess:room:${ roomId }:${ playerName }`;
    }
}
