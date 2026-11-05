import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { ContrabandEventKind } from '../classes/rules/contraband-game-state';
import { Team } from '../classes/rules/contraband-rules';
import { ContrabandResult } from '../classes/rules/standings';

/** The table as a page hears it: the changes its session applied live, counted, and the match */
export interface HeardContrabandTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    /** The kinds of the events of the match */
    readonly events: ReadonlyArray<ContrabandEventKind>;
    readonly result: Readonly<ContrabandResult> | null;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, the customs open, a trunk revealed,
 * and the end of the match, won or lost by the country of the local player, won for a spectator, a draw on a tie. The
 * money moved is heard with its chips
 */
export function tableSounds(before: Readonly<HeardContrabandTable>, after: Readonly<HeardContrabandTable>, myTeam: Team | null): ReadonlyArray<OneShotSoundEffect> {
    const sounds: OneShotSoundEffect[] = [];
    const told: ReadonlySet<ContrabandEventKind> = new Set(after.events.slice(before.events.length));

    if (after.seatsTaken > before.seatsTaken) {
        sounds.push(SoundEffect.SEAT_TAKEN);
    }
    if (told.has(ContrabandEventKind.PACKED)) {
        sounds.push(SoundEffect.CHESS_TURN_START);
    }
    if (told.has(ContrabandEventKind.SETTLED)) {
        sounds.push(SoundEffect.POKER_CARD_TURN);
    }
    if (after.result !== null && before.result === null) {
        sounds.push(gameEndSound<Team>(after.result.winner, myTeam));
    }

    return sounds;
}
