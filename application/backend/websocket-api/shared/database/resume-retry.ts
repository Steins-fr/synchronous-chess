import { DatabaseResumingException } from '@aws-sdk/client-rds-data';

/**
 * The waits before each new try of a request the cluster refused while resuming, in milliseconds: 23 seconds in all,
 * more than the 15 seconds a paused cluster takes to resume (30 seconds or more after a pause of a day, AWS says)
 */
export const RESUME_DELAYS: readonly number[] = [0, 1000, 2000, 4000, 8000, 8000];

function wait(delay: number): Promise<void> {
    return new Promise((resolve: () => void): void => {
        setTimeout(resolve, delay);
    });
}

/**
 * Sends the request until the cluster runs it: the Data API refuses it with a DatabaseResumingException while the
 * paused cluster resumes, which the SDK does not retry (an error of the client). Nothing ran then: the request is sent
 * again as it is. Any other failure, a timeout of the statement for one, is not
 * @param delays the waits left before each new try
 * @throws {DatabaseResumingException} when the cluster still resumes once the waits are over
 */
export async function retryOnResume<Output>(send: () => Promise<Output>, delays: readonly number[] = RESUME_DELAYS): Promise<Output> {
    try {
        return await send();
    } catch (err) {
        const [delay, ...nextDelays]: readonly number[] = delays;

        if (!(err instanceof DatabaseResumingException) || delay === undefined) {
            throw err;
        }

        await wait(delay);
        return retryOnResume(send, nextDelays);
    }
}
