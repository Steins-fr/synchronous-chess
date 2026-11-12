import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound, SOUND_GAP } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { FixedRouletteEvent, FixedRouletteEventKind, FixedRoulettePhase, FixedRouletteResult, SettledEvent } from '../classes/rules/fixed-roulette-game-state';
import { sideOf } from '../classes/rules/fixed-roulette-rules';
import { netOf } from '../classes/rules/settlement';

/** The table as a page hears it: the changes its session applied live, counted, and the match */
export interface HeardFixedTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    readonly events: ReadonlyArray<Readonly<FixedRouletteEvent>>;
    readonly result: Readonly<FixedRouletteResult> | null;
}

/** A sound, later by its delay in seconds */
export interface TimedSound {
    readonly effect: OneShotSoundEffect;
    readonly delay: number;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, the chips of a bet, the ball revealed
 * rolling to its pocket, then the chips it settled, a gain or a loss for a player of the match, the chips of a game void
 * going back, and the end of the match, won or lost for a player, won for a spectator, a draw on equal chips
 *
 * @param me the local player, by its index in the match: none for a spectator
 * @param roll the time the ball revealed rolls to its pocket, in seconds: the chips of the game settled go after it
 */
export function tableSounds(before: Readonly<HeardFixedTable>, after: Readonly<HeardFixedTable>, me: number | null, roll: number): ReadonlyArray<TimedSound> {
    const sounds: TimedSound[] = [];

    if (after.seatsTaken > before.seatsTaken) {
        sounds.push({ effect: SoundEffect.SEAT_TAKEN, delay: 0 });
    }
    after.events.slice(before.events.length).forEach((event: Readonly<FixedRouletteEvent>) => sounds.push(...eventSounds(event, me, roll)));
    if (after.result !== null && before.result === null) {
        // After the sounds of the game ending the match
        const delay: number = sounds.length === 0 ? 0 : Math.max(...sounds.map((sound: TimedSound) => sound.delay)) + SOUND_GAP;
        sounds.push({ effect: gameEndSound(after.result.winner, me), delay });
    }

    return sounds;
}

function eventSounds(event: Readonly<FixedRouletteEvent>, me: number | null, roll: number): ReadonlyArray<TimedSound> {
    switch (event.kind) {
        case FixedRouletteEventKind.PLACED:
        case FixedRouletteEventKind.BET:
        case FixedRouletteEventKind.CHEATED:
            // The chips bet, or the bets of a game void back to their owners
            return [{ effect: SoundEffect.CHIPS, delay: 0 }];
        case FixedRouletteEventKind.LATE:
            // A croupier late to place leaves no chip on the table
            return event.phase === FixedRoulettePhase.PLACING ? [] : [{ effect: SoundEffect.CHIPS, delay: 0 }];
        case FixedRouletteEventKind.SETTLED:
            return [{ effect: SoundEffect.FIXED_BALL_DROP, delay: 0 }, { effect: settledSound(event, me), delay: roll }];
    }
}

/** The chips of a game settled: gathered by a player of the match winning chips, lost by one losing some, else moved */
function settledSound(event: Readonly<SettledEvent>, me: number | null): OneShotSoundEffect {
    const net: number = me === null ? 0 : netOf(event.settlement, event.bets, sideOf(me, event.croupier));

    if (net === 0) {
        return SoundEffect.CHIPS;
    }
    return net > 0 ? SoundEffect.POKER_POT_WON : SoundEffect.POKER_POT_LOST;
}
