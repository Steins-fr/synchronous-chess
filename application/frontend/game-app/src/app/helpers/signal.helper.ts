import { linkedSignal, Resource, resourceFromSnapshots, ResourceSnapshot, Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap, timer } from 'rxjs';

/** How long a wait lasts before its loader shows, in milliseconds: a quick one shows none */
export const LOADER_DELAY: number = 400;

/**
 * The resource, its previous value kept while it loads a new one, or waits without request (idle): a new search keeps
 * the list of the former one until answered. Unlike once it failed: an error has no value
 * @see https://angular.dev/guide/signals/resource#resource-composition-with-snapshots
 */
export function withPreviousValue<T>(input: Pick<Resource<T>, 'snapshot'>): Resource<T> {
    const snapshot = linkedSignal<ResourceSnapshot<T>, ResourceSnapshot<T>>({
        source: input.snapshot,
        computation: (snap: ResourceSnapshot<T>, previous?: { value: ResourceSnapshot<T> }) =>
            (snap.status === 'loading' || snap.status === 'idle') && previous !== undefined && previous.value.status !== 'error'
                ? { status: snap.status, value: previous.value.value }
                : snap,
    });

    return resourceFromSnapshots(snapshot);
}

/**
 * Whether the condition holds for the delay, in milliseconds: true once it held that long, false as soon as it no longer
 * holds. A loader shows that way for a wait long enough only. Called in an injection context
 */
export function heldFor(condition: Signal<boolean>, delay: number): Signal<boolean> {
    return toSignal(toObservable(condition).pipe(
        switchMap((holds: boolean) => holds ? timer(delay).pipe(map((): boolean => true)) : of(false)),
    ), { initialValue: false });
}
