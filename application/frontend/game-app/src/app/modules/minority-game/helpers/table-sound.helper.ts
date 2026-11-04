import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { MinorityEventKind } from '../classes/rules/minority-game-state';
import { MinorityResult } from '../classes/rules/standings';

/** The table as a page hears it: the changes its session applied live, counted, and the game */
export interface HeardMinorityTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    /** The kinds of the events of the game */
    readonly events: ReadonlyArray<MinorityEventKind>;
    /** The local player is eliminated */
    readonly eliminated: boolean;
    readonly result: Readonly<MinorityResult> | null;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, a question asked, the votes
 * revealed, the local player eliminated, and the end of the game, won or lost for the local player, won for a spectator
 * (a draw when nobody won);
 * a player eliminated before the end heard its loss already
 */
export function tableSounds(before: Readonly<HeardMinorityTable>, after: Readonly<HeardMinorityTable>, me: number | null): ReadonlyArray<OneShotSoundEffect> {
    const sounds: OneShotSoundEffect[] = [];
    const told: ReadonlySet<MinorityEventKind> = new Set(after.events.slice(before.events.length));

    if (after.seatsTaken > before.seatsTaken) {
        sounds.push(SoundEffect.SEAT_TAKEN);
    }
    if (told.has(MinorityEventKind.ASKED)) {
        sounds.push(SoundEffect.CHESS_TURN_START);
    }
    if (told.has(MinorityEventKind.COUNTED)) {
        sounds.push(SoundEffect.POKER_CARD_TURN);
    }
    if (after.result !== null && before.result === null && !before.eliminated) {
        sounds.push(endSound(after.result, me));
    } else if (after.result === null && after.eliminated && !before.eliminated) {
        sounds.push(SoundEffect.GAME_LOST);
    }

    return sounds;
}

/** The end of the game: won or lost for a player, won for a spectator, a draw when nobody won */
function endSound(result: Readonly<MinorityResult>, me: number | null): OneShotSoundEffect {
    if (me !== null) {
        return result.winners.includes(me) ? SoundEffect.GAME_WON : SoundEffect.GAME_LOST;
    }
    return result.winners.length > 0 ? SoundEffect.GAME_WON : SoundEffect.GAME_DRAW;
}
