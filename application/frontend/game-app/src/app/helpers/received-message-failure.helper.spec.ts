import { logHandlingFailure } from './received-message-failure.helper';
import { TimedLogger } from './timed-logger.helper';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('logHandlingFailure', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should log the failure with the message type and sender', async () => {
        // Given
        const errorSpy = vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        const reason: Error = new Error('invalid payload');

        // When
        logHandlingFailure({ type: 'move', from: 'b' }, Promise.reject(reason));
        logHandlingFailure({ type: 'chat', from: 'c' }, Promise.resolve());

        // Then
        await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledExactlyOnceWith('Failed to handle move from b', reason));
    });
});
