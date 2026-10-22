import { wait } from './wait.helper';

/**
 * Yields to the browser once a slice of time is spent, for a long computation to keep the page fluid: waiting after
 * each of its steps would cost more than the steps, the browsers delaying nested timers 4 milliseconds at least
 * @returns a pause to await between two steps of the computation
 */
export function timeSlices(sliceMs: number = 40): () => Promise<void> {
    let since: number = performance.now();

    return async () => {
        if (performance.now() - since >= sliceMs) {
            await wait(0);
            since = performance.now();
        }
    };
}
