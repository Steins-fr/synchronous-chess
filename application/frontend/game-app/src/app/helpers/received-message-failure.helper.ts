import { TimedLogger } from './timed-logger.helper';

/**
 * Logs the failure of the handling of a message received from a peer:
 * only its envelope is validated on reception, so its payload may still make the handler throw.
 */
export function logHandlingFailure(message: { readonly type: string; readonly from: string }, handling: Promise<unknown>): Promise<void> {
    return handling.then(
        () => undefined,
        (reason: unknown) => TimedLogger.error(`Failed to handle ${ message.type } from ${ message.from }`, reason),
    );
}
