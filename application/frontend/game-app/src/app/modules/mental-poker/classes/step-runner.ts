import { TimedLogger } from '@app/helpers/timed-logger.helper';

/**
 * Makes the steps of the local player in a game of the chain (a deck, a cylinder), one at a time: asked again while
 * making them, it makes them once more after, the chain having changed meanwhile. A step failing is logged, the next
 * run trying again
 */
export class StepRunner {
    private running: boolean = false;
    private again: boolean = false;
    private _stopped: boolean = false;

    /**
     * @param steps makes what the game waits for from the local player
     * @param failure the log of a step failing
     */
    public constructor(private readonly steps: () => Promise<void>, private readonly failure: () => string) {
    }

    /** The game is over for the page: it makes no step anymore */
    public get stopped(): boolean {
        return this._stopped;
    }

    public async run(): Promise<void> {
        if (this.running) {
            this.again = true;
            return;
        }

        this.running = true;

        try {
            do {
                this.again = false;
                // eslint-disable-next-line no-await-in-loop -- one thing at a time
                await this.steps();
            } while (this.again && !this._stopped);
        } catch (error: unknown) {
            TimedLogger.error(this.failure(), error);
        } finally {
            this.running = false;
        }

        // A step failed while the chain changed meanwhile: the steps are made again, no message coming to ask for them
        if (this.again && !this._stopped) {
            await this.run();
        }
    }

    public stop(): void {
        this._stopped = true;
    }
}
