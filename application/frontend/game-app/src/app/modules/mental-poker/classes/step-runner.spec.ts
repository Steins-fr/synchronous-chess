import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { StepRunner } from './step-runner';

describe('StepRunner', () => {
    let made: number;
    /** Each run waits for its release */
    let releases: Array<() => void>;
    let runner: StepRunner;

    beforeEach(() => {
        made = 0;
        releases = [];
        runner = new StepRunner(() => new Promise<void>((resolve) => releases.push(() => {
            made++;
            resolve();
        })), () => 'The game failed');
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should make the steps one at a time, once more when asked again meanwhile', async () => {
        // Given
        const running: Promise<void> = runner.run();

        // When
        void runner.run();
        void runner.run();
        releases[0]();
        await vi.waitFor(() => expect(releases).toHaveLength(2));
        releases[1]();
        await running;

        // Then
        expect(made).toEqual(2);
    });

    test('should make no more steps once stopped', async () => {
        // Given
        const running: Promise<void> = runner.run();
        void runner.run();

        // When
        runner.stop();
        releases[0]();
        await running;

        // Then
        expect(runner.stopped).toBe(true);
        expect(made).toEqual(1);
        expect(releases).toHaveLength(1);
    });

    test('should make the steps again after a step failing, once asked again meanwhile', async () => {
        // Given the steps fail once, asked again while they run
        let calls: number = 0;
        const failing = new StepRunner(async () => {
            calls++;
            if (calls === 1) {
                void failing.run();
                throw new Error('closed');
            }
        }, () => 'The game failed');

        // When
        await failing.run();

        // Then
        expect(calls).toEqual(2);
        expect(TimedLogger.error).toHaveBeenCalledOnce();
    });

    test('should log a step failing, and make the steps again at the next run', async () => {
        // Given
        const error = new Error('closed');
        const failing = new StepRunner(() => Promise.reject(error), () => 'The game failed');

        // When
        await failing.run();
        await failing.run();

        // Then
        expect(TimedLogger.error).toHaveBeenCalledTimes(2);
        expect(TimedLogger.error).toHaveBeenCalledWith('The game failed', error);
    });
});
