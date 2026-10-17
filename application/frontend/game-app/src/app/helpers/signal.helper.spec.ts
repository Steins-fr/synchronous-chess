import { Injector, Resource, ResourceSnapshot, runInInjectionContext, signal, Signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { debouncedSignal, lastDefinedSignal, withPreviousValue } from './signal.helper';

describe('debouncedSignal', () => {
    const DELAY: number = 300;
    let source: WritableSignal<string>;
    let debounced: Signal<string>;

    // The effects run once ticked, then the delay passes on the fake timers
    async function wait(time: number): Promise<void> {
        TestBed.tick();
        await vi.advanceTimersByTimeAsync(time);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        source = signal('first');
        debounced = runInInjectionContext(TestBed.inject(Injector), () => debouncedSignal(source, DELAY));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should give the first value at once', () => {
        expect(debounced()).toEqual('first');
    });

    test('should give a new value once the delay passed', async () => {
        // When
        source.set('second');
        await wait(DELAY - 1);

        // Then
        expect(debounced()).toEqual('first');

        // When
        await wait(1);

        // Then
        expect(debounced()).toEqual('second');
    });

    test('should restart the delay at each change, giving the last value only', async () => {
        // Given
        const values: string[] = [];

        // When
        source.set('se');
        await wait(DELAY - 1);
        values.push(debounced());
        source.set('second');
        await wait(DELAY - 1);
        values.push(debounced());
        await wait(1);
        values.push(debounced());

        // Then
        expect(values).toEqual(['first', 'first', 'second']);
    });

    test('should give no value once its injector is destroyed', async () => {
        // Given
        source.set('second');
        TestBed.tick();

        // When
        TestBed.resetTestingModule();
        await vi.advanceTimersByTimeAsync(DELAY);

        // Then
        expect(debounced()).toEqual('first');
    });
});

describe('lastDefinedSignal', () => {
    test('should be undefined until the source gives a value, then keep its last value while it is undefined', () => {
        // Given
        const source: WritableSignal<string | undefined> = signal(undefined);
        const last: Signal<string | undefined> = lastDefinedSignal(source);
        const values: (string | undefined)[] = [last()];

        // When
        source.set('first');
        values.push(last());
        source.set(undefined);
        values.push(last());
        source.set('second');
        values.push(last());

        // Then
        expect(values).toEqual([undefined, 'first', 'first', 'second']);
    });
});

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
