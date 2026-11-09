import { computed, inject, Signal } from '@angular/core';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';
import { TranslatableText } from '@app/types/translatable-text.type';

/** The local player plays the game of the table: leaving the page asks to confirm. Called in an injection context */
export function watchMatch(session: Signal<{ readonly inMatch: Signal<boolean> }>): Signal<boolean> {
    return inject(MatchLeaveWarning).watch(computed((): boolean => session().inMatch()));
}

/** What the table reads of its session to offer a new game */
export interface RematchSession {
    readonly over: Signal<boolean>;
    readonly sending: Signal<boolean>;
    readonly tableSeats: { readonly mySeat: Signal<number | null> };
}

/** A seated player starts a new game once the former one is over */
export function canRematchOf(session: Signal<RematchSession>): Signal<boolean> {
    return computed((): boolean => {
        const current: RematchSession = session();
        return current.over() && current.tableSeats.mySeat() !== null && !current.sending();
    });
}

/** A game over before the one in progress: its players and its result */
export interface PastGame<Result> {
    readonly players: Signal<ReadonlyArray<string>>;
    readonly result: Signal<Result | null>;
}

/**
 * The result of each game over before the one in progress, by its number in the room, the latest first
 * @param label the key of its number, `Game {number}:`
 * @param text its result, its players named
 */
export function pastResultsOf<Result>(
    session: Signal<{ readonly pastGames: Signal<ReadonlyArray<Readonly<PastGame<Result>>>> }>,
    label: string,
    text: (result: Result, players: ReadonlyArray<string>) => TranslatableText,
): Signal<ReadonlyArray<Readonly<PastResult>>> {
    return computed((): ReadonlyArray<Readonly<PastResult>> =>
        session().pastGames().map((played: Readonly<PastGame<Result>>, index: number): PastResult => ({
            number: index + 1,
            label: { key: label, params: { number: index + 1 } },
            // A game is past once over: it has its result
            text: text(played.result() as Result, played.players()),
            verification: null,
        })).reverse());
}
