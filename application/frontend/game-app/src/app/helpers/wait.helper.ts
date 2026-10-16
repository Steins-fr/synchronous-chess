/**
 * Resolves after the delay, in milliseconds
 * @param signal stops waiting once aborted: the promise rejects with an AbortError, at once when aborted already
 */
export function wait(delay: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const abort = (): void => {
            clearTimeout(timeout);
            reject(new DOMException('The wait was aborted', 'AbortError'));
        };
        const timeout = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, delay);

        if (signal?.aborted) {
            abort();
        } else {
            signal?.addEventListener('abort', abort, { once: true });
        }
    });
}
