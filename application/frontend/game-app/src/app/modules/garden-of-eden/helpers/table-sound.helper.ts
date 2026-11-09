import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { EdenEventKind } from '../classes/rules/eden-game-state';
import { EdenResult } from '../classes/rules/standings';

/** The table as a page hears it: the changes its session applied live, counted, and the game */
export interface HeardEdenTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    /** The kinds of the events of the game */
    readonly events: ReadonlyArray<EdenEventKind>;
    /** The local player lost paradise */
    readonly lostParadise: boolean;
    readonly result: Readonly<EdenResult> | null;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, the apples counted, the local
 * player losing paradise, and the end of the game, won or lost for the local player, won for a spectator (a draw when
 * nobody won). A player out before the end heard its loss already; one out in the last round hears it once
 */
export function tableSounds(before: Readonly<HeardEdenTable>, after: Readonly<HeardEdenTable>, me: number | null): ReadonlyArray<OneShotSoundEffect> {
    const sounds: OneShotSoundEffect[] = [];

    if (after.seatsTaken > before.seatsTaken) {
        sounds.push(SoundEffect.SEAT_TAKEN);
    }
    if (after.events.slice(before.events.length).includes(EdenEventKind.COUNTED)) {
        sounds.push(SoundEffect.POKER_CARD_TURN);
    }
    if (after.result !== null && before.result === null && !before.lostParadise) {
        sounds.push(endSound(after.result, me));
    } else if (after.result === null && after.lostParadise && !before.lostParadise) {
        sounds.push(SoundEffect.GAME_LOST);
    }

    return sounds;
}

/** The end of the game: won or lost for a player, won for a spectator, a draw when nobody won */
function endSound(result: Readonly<EdenResult>, me: number | null): OneShotSoundEffect {
    if (me !== null) {
        return result.winners.includes(me) ? SoundEffect.GAME_WON : SoundEffect.GAME_LOST;
    }
    return result.winners.length > 0 ? SoundEffect.GAME_WON : SoundEffect.GAME_DRAW;
}
