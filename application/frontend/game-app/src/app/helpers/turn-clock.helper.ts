import { effect, Signal, signal, untracked } from '@angular/core';

/** The clock of a move ticks every second */
const CLOCK_TICK: number = 1000;
const MS_PER_SECOND: number = 1000;
/** A tick may come a bit before the end of a move, which is over once less than half a tick is left */
const LAST_TICK: number = CLOCK_TICK / MS_PER_SECOND / 2;
/** The seconds left from which the clock of a move tells it runs out */
export const CLOCK_LOW: number = 5;

export interface TurnClockOptions {
    /** Whether a move is in progress: a change of a signal it reads is a new move, the clock starts again */
    readonly running: () => boolean;
    /** The seconds of a move, and the ones it gains, once, while a seated player is away */
    readonly times: () => { readonly turnTime: number; readonly awayTime: number };
    /** A seated player is away */
    readonly away: Signal<boolean>;
    /** The time of the move is over */
    readonly timeOut: () => void;
}

/**
 * The seconds left for the move in progress, null without one. Each move has its time from when the page sees it, by
 * the time of the page, which the clock of the system does not set back or forward. Called in an injection context
 */
export function turnClock({ running, times, away, timeOut }: TurnClockOptions): Signal<number | null> {
    const timeLeft = signal<number | null>(null);

    effect((onCleanup: (cleanup: () => void) => void): void => {
        if (!running()) {
            timeLeft.set(null);
            return;
        }

        const { turnTime, awayTime } = untracked(times);
        let deadline: number = performance.now() + turnTime * MS_PER_SECOND;
        let extended: boolean = false;
        timeLeft.set(turnTime);
        const clock: ReturnType<typeof setInterval> = setInterval(() => {
            // A seated player away gives the move more time, once: a player leaving and coming back gets no more
            if (!extended && away()) {
                extended = true;
                deadline += awayTime * MS_PER_SECOND;
            }

            const left: number = (deadline - performance.now()) / MS_PER_SECOND;

            if (left < LAST_TICK) {
                timeLeft.set(0);
                clearInterval(clock);
                timeOut();
            } else {
                timeLeft.set(Math.ceil(left));
            }
        }, CLOCK_TICK);
        onCleanup(() => clearInterval(clock));
    });

    return timeLeft.asReadonly();
}
