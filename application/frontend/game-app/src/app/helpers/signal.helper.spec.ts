import { Resource, ResourceSnapshot, Signal, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { heldFor, withPreviousValue } from './signal.helper';

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

describe('heldFor', () => {
    const delay: number = 100;
    let condition: WritableSignal<boolean>;
    let held: Signal<boolean>;

    // Lets the condition reach the signal held, once the time passed
    async function wait(time: number = 0): Promise<void> {
        TestBed.tick();
        await vi.advanceTimersByTimeAsync(time);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        condition = signal<boolean>(false);
        held = TestBed.runInInjectionContext(() => heldFor(condition, delay));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should be true once the condition held for the delay', async () => {
        // When
        condition.set(true);
        await wait(delay - 1);

        // Then
        expect(held()).toBe(false);

        // When
        await wait(1);

        // Then
        expect(held()).toBe(true);
    });

    test('should be false as soon as the condition no longer holds', async () => {
        // Given
        condition.set(true);
        await wait(delay);

        // When
        condition.set(false);
        await wait();

        // Then
        expect(held()).toBe(false);
    });

    test('should stay false while the condition holds shorter than the delay', async () => {
        // When
        condition.set(true);
        await wait(delay - 1);
        condition.set(false);
        await wait(delay);

        // Then
        expect(held()).toBe(false);
    });
});
