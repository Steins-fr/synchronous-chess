import { afterEach, describe, expect, test } from 'vitest';
import { RoomLock, RoomLocks } from './room-lock';

/** The locks of a browser, one holder per name, the requests waiting for it until their signal aborts */
class FakeLockManager {
    private readonly held = new Map<string, Array<() => void>>();

    public query(): Promise<{ held: Array<{ name: string }> }> {
        return Promise.resolve({ held: [...this.held].filter(([, holders]) => holders.length > 0).map(([name]) => ({ name })) });
    }

    public request(name: string, options: LockOptions, callback: (lock: object | null) => Promise<void> | undefined): Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (reason: unknown) => void) => {
            const grant = (): void => void callback({ name })?.then(() => {
                this.held.get(name)?.shift();
                this.held.get(name)?.[0]?.();
                resolve();
            });
            const waiting: Array<() => void> = this.held.get(name) ?? [];

            if (waiting.length > 0 && options.ifAvailable) {
                callback(null);
                resolve();
                return;
            }

            this.held.set(name, [...waiting, grant]);

            if (waiting.length === 0) {
                grant();
                return;
            }
            options.signal?.addEventListener('abort', () => {
                this.held.set(name, (this.held.get(name) ?? []).filter((queued: () => void) => queued !== grant));
                reject(options.signal?.reason);
            });
        });
    }
}

describe('RoomLocks', () => {
    afterEach(() => {
        Reflect.deleteProperty(navigator, 'locks');
    });

    const useLocks = (locks: object): void => {
        Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    };

    test('should hold the lock as if alone without the locks of the browser', async () => {
        // When
        const lock: RoomLock | undefined = await RoomLocks.hold('room#000001', 'alice');

        // Then
        expect(lock).toBeDefined();
        expect(() => lock?.release()).not.toThrow();
    });

    test('should tell the lock another tab holds, until it releases it', async () => {
        // Given
        useLocks(new FakeLockManager());
        const first: RoomLock | undefined = await RoomLocks.hold('room#000001', 'alice');

        // When
        const held: RoomLock | undefined = await RoomLocks.hold('room#000001', 'alice', 10);
        const available: RoomLock | undefined = await RoomLocks.hold('room#000001', 'alice');
        const other: RoomLock | undefined = await RoomLocks.hold('room#000001', 'bob');

        // Then
        expect(first).toBeDefined();
        expect(held).toBeUndefined();
        expect(available).toBeUndefined();
        expect(other).toBeDefined();

        // When the first tab releases it
        first?.release();

        // Then
        await expect(RoomLocks.hold('room#000001', 'alice', 10)).resolves.toBeDefined();
    });

    test('should hold the lock released during the wait', async () => {
        // Given
        useLocks(new FakeLockManager());
        const reloaded: RoomLock | undefined = await RoomLocks.hold('room#000001', 'alice');
        const held: Promise<RoomLock | undefined> = RoomLocks.hold('room#000001', 'alice', 2000);

        // When
        reloaded?.release();

        // Then
        await expect(held).resolves.toBeDefined();
    });

    test('should hold the lock as if alone when the browser refuses the locks', async () => {
        // Given
        useLocks({ request: () => Promise.reject(new DOMException('No origin', 'SecurityError')) });

        // When, Then
        await expect(RoomLocks.hold('room#000001', 'alice')).resolves.toBeDefined();
        await expect(RoomLocks.hold('room#000001', 'alice', 2000)).resolves.toBeDefined();
    });

    test('should tell whether a tab holds the room under a name', async () => {
        // Given
        useLocks(new FakeLockManager());
        await RoomLocks.hold('room#000001', 'alice');

        // When, Then
        await expect(RoomLocks.isHeld('room#000001', 'alice')).resolves.toBe(true);
        await expect(RoomLocks.isHeld('room#000001', 'bob')).resolves.toBe(false);
    });

    test.each<[string, object | undefined]>([
        ['without the locks of the browser', undefined],
        ['when the browser refuses the locks', { query: () => Promise.reject(new DOMException('No origin', 'SecurityError')) }],
        ['when the browser tells no lock held', { query: () => Promise.resolve({}) }],
    ])('should tell no tab holds the room %s', async (_case: string, locks: object | undefined) => {
        // Given
        if (locks !== undefined) {
            useLocks(locks);
        }

        // When, Then
        await expect(RoomLocks.isHeld('room#000001', 'alice')).resolves.toBe(false);
    });
});
