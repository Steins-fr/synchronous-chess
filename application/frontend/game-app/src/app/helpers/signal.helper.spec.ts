import { Injector, ResourceStatus, runInInjectionContext, signal, Signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { debouncedSignal, lastDefinedSignal, resourceFailedSignal } from './signal.helper';

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

describe('resourceFailedSignal', () => {
    test('should tell the resource failed, while it loads again, until a load succeeds', () => {
        // Given
        const status: WritableSignal<ResourceStatus> = signal<ResourceStatus>('loading');
        const failed: Signal<boolean> = resourceFailedSignal({ status });
        const values: boolean[] = [failed()];

        // When
        for (const next of ['error', 'loading', 'error', 'reloading', 'resolved', 'reloading'] as ResourceStatus[]) {
            status.set(next);
            values.push(failed());
        }

        // Then
        expect(values).toEqual([false, true, true, true, true, false, false]);
    });
});
