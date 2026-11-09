import { computed, linkedSignal, Signal, untracked } from '@angular/core';
import { CLOCK_LOW, turnClock } from '@app/helpers/turn-clock.helper';
import { TranslatableText } from '@app/types/translatable-text.type';
import { clockText } from './table-texts.helper';

/** The seconds a page waits again once its claim of a timeout came too early on the time of the chain */
const RETRY_TIME: number = 5;

/** What the clock of a phase reads of the session of a game committing then revealing its moves */
export interface ClockedSession {
    readonly rules: Readonly<{ awayTime: number }>;
    /** The game played: its number in the room and its attempt */
    readonly played: Signal<Readonly<{ index: number; attempt: number }>>;
    readonly step: Signal<number>;
    /** The names of the players the phase waits for */
    readonly awaited: Signal<ReadonlyArray<string>>;
    /** The ones of them who are away */
    readonly awaitedAway: Signal<ReadonlyArray<string>>;
    readonly phaseTime: Signal<number>;
    readonly voidedClaims: Signal<number>;
    readonly myIndex: Signal<number | null>;
    claimTimeout(): void;
}

export interface PhaseClockOptions<Session extends ClockedSession> {
    /** The players away who give the phase more time, once: by default, every player it waits for who is away */
    readonly extendingAway?: (session: Session) => ReadonlyArray<string>;
}

/** The clock of the phase in progress, for the players it waits for */
export interface PhaseClock {
    /** The round in progress: its game, its attempt, its step. The forms of a round start again with it */
    readonly roundKey: Signal<string>;
    /** The time left, null without a phase waiting */
    readonly text: Signal<TranslatableText | null>;
    /** The time runs out */
    readonly low: Signal<boolean>;
    /** A player the phase waits for is away */
    readonly waitingAway: Signal<boolean>;
    /**
     * The time of the round the clock ran for is over: a player of the game claims it, then the phase closes or its time
     * goes on for the players away. A late tick of the clock of a round closed claims nothing
     */
    timeOut(round: string | null): void;
}

/**
 * The clock of a phase of a game committing then revealing its moves, by the time of the page. Once its time is over,
 * the page claims it on the time of the chain; a claim voided as too early is made again a little later. Called in an
 * injection context
 */
export function phaseClock<Session extends ClockedSession>(session: Signal<Session>, options: PhaseClockOptions<Session> = {}): PhaseClock {
    const roundKey: Signal<string> = computed((): string => {
        const played: Readonly<{ index: number; attempt: number }> = session().played();
        return `${ played.index }:${ played.attempt }:${ session().step() }`;
    });
    // A claim voided as too early: the page claims again once the time it was early by is over
    const voidedAt: Signal<number> = linkedSignal({ source: roundKey, computation: () => untracked(() => session().voidedClaims()) });
    const clockKey: Signal<string | null> = computed((): string | null =>
        session().awaited().length === 0 ? null : `${ roundKey() }:${ session().voidedClaims() }`);
    const waitingAway: Signal<boolean> = computed((): boolean => session().awaitedAway().length > 0);
    const extended: Signal<boolean> = computed((): boolean => (options.extendingAway?.(session()) ?? session().awaitedAway()).length > 0);

    const timeOut = (round: string | null): void => {
        const current: Session = session();
        if (round === roundKey() && current.myIndex() !== null && current.awaited().length > 0) {
            current.claimTimeout();
        }
    };

    /** The round the clock runs for, from its start */
    let clocked: string | null = null;
    const timeLeft: Signal<number | null> = turnClock({
        running: () => clockKey() !== null,
        times: () => {
            clocked = roundKey();
            return {
                turnTime: session().voidedClaims() > voidedAt() ? RETRY_TIME : session().phaseTime(),
                awayTime: session().rules.awayTime,
            };
        },
        away: extended,
        timeOut: () => timeOut(clocked),
    });

    return {
        roundKey,
        text: computed((): TranslatableText | null => {
            const left: number | null = timeLeft();
            return left === null ? null : clockText(left);
        }),
        low: computed((): boolean => (timeLeft() ?? CLOCK_LOW + 1) <= CLOCK_LOW),
        waitingAway,
        timeOut,
    };
}
