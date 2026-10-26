import { afterEach, describe, expect, test, vi } from 'vitest';
import { timeSlices } from './time-slices.helper';

describe('timeSlices', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Spies on the messages posted to yield to the browser */
    function spyMessages(): ReturnType<typeof vi.spyOn> {
        return vi.spyOn(MessagePort.prototype, 'postMessage');
    }

    test('should yield to the browser once a slice of time is spent only', async () => {
        // Given
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const posted = spyMessages();
        const pause = timeSlices(40);

        // When within the slice
        now.mockReturnValue(39);
        await pause();

        // Then
        expect(posted).not.toHaveBeenCalled();

        // When the slice is spent
        now.mockReturnValue(40);
        let paused: boolean = false;
        const pausing: Promise<void> = pause().then(() => {
            paused = true;
        });
        await Promise.resolve();

        // Then it waits for a message of the page, without any timer, the next slice starting after it
        expect(posted).toHaveBeenCalledTimes(1);
        expect(paused).toEqual(false);
        await pausing;
        now.mockReturnValue(79);
        await pause();
        expect(posted).toHaveBeenCalledTimes(1);
    });

    test('should slice 40 milliseconds by default', async () => {
        // Given
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const posted = spyMessages();
        const pause = timeSlices();

        // When
        now.mockReturnValue(39);
        await pause();
        now.mockReturnValue(40);
        await pause();

        // Then
        expect(posted).toHaveBeenCalledTimes(1);
    });
});
