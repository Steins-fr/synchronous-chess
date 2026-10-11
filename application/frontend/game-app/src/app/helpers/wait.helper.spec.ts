import { wait } from '@app/helpers/wait.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('wait', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test.each([
        ['without signal', undefined],
        ['with a signal not aborted', new AbortController().signal],
    ])('should resolve after the delay, %s', async (_case: string, signal: AbortSignal | undefined) => {
        // Given
        const resolved = vi.fn();
        void wait(1000, signal).then(resolved);

        // When
        await vi.advanceTimersByTimeAsync(999);

        // Then
        expect(resolved).not.toHaveBeenCalled();

        // When
        await vi.advanceTimersByTimeAsync(1);

        // Then
        expect(resolved).toHaveBeenCalledTimes(1);
    });

    test('should stop waiting once the signal aborts', async () => {
        // Given
        const controller: AbortController = new AbortController();
        const waiting: Promise<void> = wait(1000, controller.signal);

        // When
        controller.abort();

        // Then
        await expect(waiting).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
        expect(vi.getTimerCount()).toEqual(0);
    });

    test('should not wait with a signal aborted already', async () => {
        // Given
        const controller: AbortController = new AbortController();
        controller.abort();

        // When / Then
        await expect(wait(1000, controller.signal)).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
        expect(vi.getTimerCount()).toEqual(0);
    });
});
