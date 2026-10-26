/**
 * Resolves once the browser ran its pending tasks: a message posted to a channel of the page, which no browser
 * throttles in a hidden page, where it delays a timer 1 second at least (1 minute in Chrome after 5 minutes hidden)
 */
function yieldToBrowser(): Promise<void> {
    return new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (): void => {
            channel.port1.close();
            resolve();
        };
        channel.port2.postMessage(null);
    });
}

/**
 * Yields to the browser once a slice of time is spent, for a long computation to keep the page fluid: waiting after
 * each of its steps would cost more than the steps. A hidden page computes as fast: the players of a game wait for it
 * @returns a pause to await between two steps of the computation
 */
export function timeSlices(sliceMs: number = 40): () => Promise<void> {
    let since: number = performance.now();

    return async () => {
        if (performance.now() - since >= sliceMs) {
            await yieldToBrowser();
            since = performance.now();
        }
    };
}
