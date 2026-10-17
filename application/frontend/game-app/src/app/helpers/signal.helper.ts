import { effect, linkedSignal, Resource, ResourceStatus, Signal, signal, untracked } from '@angular/core';

/**
 * The value of the source, at once the first one, then once it stopped changing for the delay given: each change
 * restarts the delay. To create in an injection context, like the effect following the source
 * @param delay in milliseconds
 */
export function debouncedSignal<T>(source: Signal<T>, delay: number): Signal<T> {
    const debounced = signal<T>(untracked(source));

    effect((onCleanup: (cleanup: () => void) => void) => {
        const value: T = source();
        const timeout: ReturnType<typeof setTimeout> = setTimeout(() => debounced.set(value), delay);
        // The next change, or the destruction of the effect, cancels the value not set yet
        onCleanup(() => clearTimeout(timeout));
    });

    return debounced.asReadonly();
}

/**
 * The last value of the source that was not undefined, kept while the source is undefined: undefined until the source
 * gives a value. Keeps the value of a resource while it loads again, or once it failed
 */
export function lastDefinedSignal<T>(source: () => T | undefined): Signal<T | undefined> {
    return linkedSignal<T | undefined, T | undefined>({
        source,
        computation: (value: T | undefined, previous?: { value: T | undefined }) => value ?? previous?.value,
    }).asReadonly();
}

/**
 * Whether the last load of the resource failed: true once it failed, until a load succeeds, so kept while it loads
 * again. To tell a list failed while showing the one loaded before
 */
export function resourceFailedSignal(resource: Pick<Resource<unknown>, 'status'>): Signal<boolean> {
    return linkedSignal<ResourceStatus, boolean>({
        source: resource.status,
        computation: (status: ResourceStatus, previous?: { value: boolean }) => status === 'error' || (status !== 'resolved' && (previous?.value ?? false)),
    }).asReadonly();
}
