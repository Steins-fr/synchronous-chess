import { Resource, ResourceSnapshot, signal, WritableSignal } from '@angular/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { withPreviousValue } from './signal.helper';

describe('withPreviousValue', () => {
    let snapshot: WritableSignal<ResourceSnapshot<string | undefined>>;
    let kept: Resource<string | undefined>;

    beforeEach(() => {
        snapshot = signal<ResourceSnapshot<string | undefined>>({ status: 'loading', value: undefined });
        kept = withPreviousValue({ snapshot });
    });

    /** The status and the value of the resource kept, undefined once it failed */
    function state(): { status: string; value: string | undefined } {
        return { status: kept.status(), value: kept.hasValue() ? kept.value() : undefined };
    }

    test('should load without value until the first one', () => {
        expect(state()).toEqual({ status: 'loading', value: undefined });
    });

    test.each<[string, ResourceSnapshot<string | undefined>]>([
        ['loads a new one', { status: 'loading', value: undefined }],
        ['waits without request', { status: 'idle', value: undefined }],
    ])('should keep the previous value while it %s', (_case: string, next: ResourceSnapshot<string | undefined>) => {
        // Given: read, like a template does, the previous value of a linkedSignal being the last one computed
        snapshot.set({ status: 'resolved', value: 'first' });
        state();

        // When
        snapshot.set(next);

        // Then
        expect(state()).toEqual({ status: next.status, value: 'first' });
    });

    test('should give the new value once resolved', () => {
        // Given
        snapshot.set({ status: 'resolved', value: 'first' });
        state();
        snapshot.set({ status: 'loading', value: undefined });
        state();

        // When
        snapshot.set({ status: 'resolved', value: 'second' });

        // Then
        expect(state()).toEqual({ status: 'resolved', value: 'second' });
    });

    test('should fail without value, then load without the value lost', () => {
        // Given
        snapshot.set({ status: 'resolved', value: 'first' });
        state();

        // When
        snapshot.set({ status: 'error', error: new Error('Failed') });

        // Then
        expect(state()).toEqual({ status: 'error', value: undefined });
        expect(kept.error()).toEqual(new Error('Failed'));

        // When
        snapshot.set({ status: 'loading', value: undefined });

        // Then
        expect(state()).toEqual({ status: 'loading', value: undefined });
    });
});
