import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { RouletteResult } from '../classes/rules/roulette-game';
import { RouletteSeat } from '../classes/rules/roulette-seat';

/** The table as a page hears it: the changes its session applied live, counted, and what the table shows */
export interface HeardTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    /** The bullets of a player loaded live: its key given as it clicks to load them */
    readonly loads: number;
    /** Where the revolver aims: a seat, or the sky to reveal a chamber; null while it lies on the cloth */
    readonly aim: string | null;
    /** The result of the game, once its latest shot is over */
    readonly result: Readonly<RouletteResult> | null;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, the bullets of a player loaded, the
 * hammer cocked as the revolver aims at a player or at the sky, and the end of the game, won, lost or drawn for the local
 * player. The table plays the chamber fired and the chips moved with the moves
 */
export function tableSounds(before: Readonly<HeardTable>, after: Readonly<HeardTable>, mySeat: RouletteSeat | null): ReadonlyArray<OneShotSoundEffect> {
    const sounds: OneShotSoundEffect[] = [];

    if (after.seatsTaken > before.seatsTaken) {
        sounds.push(SoundEffect.SEAT_TAKEN);
    }
    if (after.loads > before.loads) {
        sounds.push(SoundEffect.ROULETTE_LOAD);
    }
    if (after.aim !== null && after.aim !== before.aim) {
        sounds.push(SoundEffect.ROULETTE_COCK);
    }

    if (after.result !== null && before.result === null) {
        sounds.push(gameEndSound(after.result.winner, mySeat));
    }

    return sounds;
}
