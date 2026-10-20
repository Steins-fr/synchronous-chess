import { filter, fromEvent, Observable } from 'rxjs';
import { objectHasValue } from './object.helper';

// The preferences of the user kept in the local storage of the browser. The storage can be unavailable (blocked by the
// browser): reading it, or only reaching it, throws. A pick then lasts until the page leaves

/** The value stored under the key, when it is one of the values (an enum), else undefined */
export function storedValue<T extends string>(window: Window, key: string, values: Readonly<Record<string, T>>): T | undefined {
    try {
        const stored = window.localStorage.getItem(key) as T;
        return objectHasValue(values, stored) ? stored : undefined;
    } catch {
        return undefined;
    }
}

export function storeValue(window: Window, key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Not stored, see storedValue
    }
}

/** The changes another tab of the app made to the value stored under the key, a cleared storage included (an event without key) */
export function storageChanges(window: Window, key: string): Observable<StorageEvent> {
    return fromEvent<StorageEvent>(window, 'storage').pipe(filter((event: StorageEvent) => event.key === null || event.key === key));
}
