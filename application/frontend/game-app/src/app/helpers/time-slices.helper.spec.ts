import { afterEach, describe, expect, test, vi } from 'vitest';
import { timeSlices } from './time-slices.helper';

describe('timeSlices', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should yield to the browser once a slice of time is spent only', async () => {
        // Given
        vi.useFakeTimers();
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const pause = timeSlices(40);
        let paused: boolean = false;

        // When within the slice
        now.mockReturnValue(39);
        await pause();

        // Then
        expect(vi.getTimerCount()).toEqual(0);

        // When the slice is spent
        now.mockReturnValue(40);
        void pause().then(() => paused = true);
        await Promise.resolve();

        // Then it waits for a timer, the next slice starting after it
        expect(paused).toEqual(false);
        await vi.runAllTimersAsync();
        expect(paused).toEqual(true);
        now.mockReturnValue(79);
        await pause();
        expect(vi.getTimerCount()).toEqual(0);
    });

    test('should slice 40 milliseconds by default', async () => {
        // Given
        vi.useFakeTimers();
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const pause = timeSlices();

        // When
        now.mockReturnValue(40);
        const paused: Promise<void> = pause();

        // Then
        expect(vi.getTimerCount()).toEqual(1);
        await vi.runAllTimersAsync();
        await paused;
    });
});
