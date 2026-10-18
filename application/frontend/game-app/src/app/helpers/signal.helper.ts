import { linkedSignal, Resource, resourceFromSnapshots, ResourceSnapshot } from '@angular/core';

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
