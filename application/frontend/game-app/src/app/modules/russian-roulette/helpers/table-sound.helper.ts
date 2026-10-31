import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound, seatTaken } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { RouletteResult } from '../classes/rules/roulette-game';
import { RouletteSeat } from '../classes/rules/roulette-seat';

/** The table as a page hears it */
export interface HeardTable {
    /** The participant on each seat */
    readonly seats: ReadonlyArray<string | null>;
    /** The players who loaded their bullets: their key given as they click to load them */
    readonly loaded: number;
    /** Where the revolver aims: a seat, or the sky to reveal a chamber; null while it lies on the cloth */
    readonly aim: string | null;
    /** The bullets of each chamber fired */
    readonly chambers: ReadonlyArray<number>;
    /** The chips of each player, then of the table and of the bank */
    readonly chips: ReadonlyArray<number>;
    /** The result of the game, once its latest shot is over */
    readonly result: Readonly<RouletteResult> | null;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, the bullets of a player loaded, the
 * hammer cocked as the revolver aims at a player or at the sky, and the end of the game, won, lost or drawn for the local
 * player. A visible page plays the chamber fired once the revolver fires it, after it held in front of the player, and the
 * chips moved as they fly; a hidden page, which plays no animation, plays them at once
 */
export function tableSounds(before: Readonly<HeardTable>, after: Readonly<HeardTable>, mySeat: RouletteSeat | null, hidden: boolean): ReadonlyArray<OneShotSoundEffect> {
    const sounds: OneShotSoundEffect[] = [];

    if (seatTaken(before.seats, after.seats)) {
        sounds.push(SoundEffect.SEAT_TAKEN);
    }
    if (after.loaded > before.loaded) {
        sounds.push(SoundEffect.ROULETTE_LOAD);
    }
    if (after.aim !== null && after.aim !== before.aim) {
        sounds.push(SoundEffect.ROULETTE_COCK);
    }

    const fired: number | undefined = after.chambers.length > before.chambers.length ? after.chambers.at(-1) : undefined;
    if (hidden && fired !== undefined) {
        sounds.push(fired === 0 ? SoundEffect.ROULETTE_CLICK : SoundEffect.ROULETTE_SHOT);
    }
    if (hidden && after.chips.some((chips: number, place: number) => chips !== before.chips[place])) {
        sounds.push(SoundEffect.CHIPS);
    }

    if (after.result !== null && before.result === null) {
        sounds.push(gameEndSound(after.result.winner, mySeat));
    }

    return sounds;
}
