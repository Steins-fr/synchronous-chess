import { Signal, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, Mock, test, vi } from 'vitest';
import { turnClock } from './turn-clock.helper';

describe('turnClock', () => {
    let move: WritableSignal<number | null>;
    let away: WritableSignal<boolean>;
    let timeOut: Mock<() => void>;
    let timeLeft: Signal<number | null>;

    /** Lets the move reach the clock, then the time pass */
    async function wait(seconds: number = 0): Promise<void> {
        TestBed.tick();
        await vi.advanceTimersByTimeAsync(seconds * 1000);
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
        move = signal<number | null>(null);
        away = signal<boolean>(false);
        timeOut = vi.fn();
        timeLeft = TestBed.runInInjectionContext(() => turnClock({
            running: () => move() !== null,
            times: () => ({ turnTime: 10, awayTime: 5 }),
            away,
            timeOut,
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should run no clock without a move', async () => {
        // When
        await wait(20);

        // Then
        expect(timeLeft()).toBeNull();
        expect(timeOut).not.toHaveBeenCalled();
    });

    test('should count the seconds of a move down, then tell its time is over, once', async () => {
        // When
        move.set(1);
        await wait();

        // Then
        expect(timeLeft()).toEqual(10);

        // When
        await wait(3);

        // Then
        expect(timeLeft()).toEqual(7);
        expect(timeOut).not.toHaveBeenCalled();

        // When
        await wait(7);

        // Then
        expect(timeLeft()).toEqual(0);
        expect(timeOut).toHaveBeenCalledOnce();

        // When
        await wait(10);

        // Then
        expect(timeOut).toHaveBeenCalledOnce();
    });

    test('should start again on a new move, and stop once none is in progress', async () => {
        // Given
        move.set(1);
        await wait(6);

        // When
        move.set(2);
        await wait();

        // Then
        expect(timeLeft()).toEqual(10);

        // When
        move.set(null);
        await wait(20);

        // Then
        expect(timeLeft()).toBeNull();
        expect(timeOut).not.toHaveBeenCalled();
    });

    test('should give the move more time, once, while a seated player is away', async () => {
        // Given
        move.set(1);
        await wait();

        // When
        away.set(true);
        await wait(1);

        // Then
        expect(timeLeft()).toEqual(14);

        // When the player comes back and leaves again
        away.set(false);
        await wait(1);
        away.set(true);
        await wait(12);

        // Then
        expect(timeOut).not.toHaveBeenCalled();

        // When
        await wait(1);

        // Then
        expect(timeOut).toHaveBeenCalledOnce();
    });
});
