import { vi, describe, test, beforeEach } from 'vitest';

export class TestHelper {
    public static cast<Type>(value: unknown): Type {
        return value as Type;
    }

    public static defineGetterSpy<T>(obj: object, prop: string, initial: T): ReturnType<typeof vi.fn> {
        const getter = vi.fn(() => initial);
        Object.defineProperty(obj, prop, { get: getter, configurable: true });
        return getter;
    }
}
