import { DatabaseErrorException, DatabaseResumingException } from '@aws-sdk/client-rds-data';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RESUME_DELAYS, retryOnResume } from './resume-retry';

function aResumingException(): DatabaseResumingException {
    return new DatabaseResumingException({ $metadata: {}, message: 'The Aurora DB instance is resuming after being auto-paused' });
}

describe('retryOnResume', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should wait more than the 15 seconds the cluster takes to resume', () => {
        expect(RESUME_DELAYS.reduce((total: number, delay: number) => total + delay, 0)).toBeGreaterThan(15_000);
    });

    test('should give the output of the request', async () => {
        // Given
        const send = vi.fn().mockResolvedValue('output');

        // When / Then
        expect(await retryOnResume(send)).toEqual('output');
        expect(send).toHaveBeenCalledOnce();
    });

    test('should send the request again, after each wait, while the cluster resumes', async () => {
        // Given
        const send = vi.fn()
            .mockRejectedValueOnce(aResumingException())
            .mockRejectedValueOnce(aResumingException())
            .mockResolvedValue('output');

        // When
        const output: Promise<unknown> = retryOnResume(send, [0, 1000, 2000]);
        await vi.advanceTimersByTimeAsync(0);
        expect(send).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(999);
        expect(send).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);

        // Then
        expect(await output).toEqual('output');
        expect(send).toHaveBeenCalledTimes(3);
    });

    test('should fail when the cluster still resumes once the waits are over', async () => {
        // Given
        const resuming: DatabaseResumingException = aResumingException();
        const send = vi.fn().mockRejectedValue(resuming);

        // When
        const output: Promise<unknown> = retryOnResume(send, [0, 1000]);
        const failure: Promise<void> = expect(output).rejects.toBe(resuming);
        await vi.advanceTimersByTimeAsync(1000);

        // Then
        await failure;
        expect(send).toHaveBeenCalledTimes(3);
    });

    test.each([
        ['an error of the database', new DatabaseErrorException({ $metadata: {}, message: 'syntax error' })],
        ['another error', new Error('Network down')],
    ])('should not send the request again after %s', async (_case: string, error: Error) => {
        // Given
        const send = vi.fn().mockRejectedValue(error);

        // When / Then
        await expect(retryOnResume(send)).rejects.toBe(error);
        expect(send).toHaveBeenCalledOnce();
    });
});
