import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { afterEach, describe, test, expect, vi } from 'vitest';

const TIME_PATTERN = /^\[\d{2}:\d{2}:\d{2}-\d{1,3}\]$/;

function stubErrorStack(stack: string | undefined): void {
    vi.stubGlobal('Error', class extends Error {
        public override readonly stack: string | undefined = stack;
    });
}

function stubCallerLine(callerLine: string): void {
    stubErrorStack(['Error', 'at getCallerInfo', 'at TimedLogger.log', callerLine].join('\n'));
}

describe('TimedLogger', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('log should debug the message with the time and the caller', () => {
        // Given
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        stubCallerLine('    at myFunction (http://localhost/main.js:10:42)');

        // When
        TimedLogger.log('message', 1);

        // Then
        expect(debugSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '[myFunction:42]', 'message', 1);
    });

    test('trace should trace the message', () => {
        // Given
        const traceSpy = vi.spyOn(console, 'trace').mockImplementation(() => undefined);
        stubCallerLine('    at http://localhost/main.js:10:42');

        // When
        TimedLogger.trace('message');

        // Then
        expect(traceSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '[anonymous:42]', '[TRACE]', 'message');
    });

    test('warn should warn the message', () => {
        // Given
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        stubCallerLine('myFunction@main.js:10:42');

        // When
        TimedLogger.warn('message');

        // Then
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '[myFunction:42]', 'message');
    });

    test('error should error the message', () => {
        // Given
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        stubCallerLine(' @main.js:10:42');

        // When
        TimedLogger.error('message');

        // Then
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '[anonymous:42]', 'message');
    });

    test('should omit the caller if the caller line is not recognized', () => {
        // Given
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        stubCallerLine('unknown caller');

        // When
        TimedLogger.log('message');

        // Then
        expect(debugSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '', 'message');
    });

    test('should omit the caller if the stack is too short', () => {
        // Given
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        stubErrorStack('Error');

        // When
        TimedLogger.log('message');

        // Then
        expect(debugSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '', 'message');
    });

    test('should omit the caller if the stack is not available', () => {
        // Given
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        stubErrorStack(undefined);

        // When
        TimedLogger.log('message');

        // Then
        expect(debugSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), '', 'message');
    });

    test('should resolve the real caller without stub', () => {
        // Given
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

        // When
        TimedLogger.log('message');

        // Then
        expect(debugSpy).toHaveBeenCalledWith(expect.stringMatching(TIME_PATTERN), expect.stringMatching(/^\[.+:\d+\]$/), 'message');
    });
});
