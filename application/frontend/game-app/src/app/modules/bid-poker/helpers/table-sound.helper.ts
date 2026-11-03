import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { BidEventKind } from '../classes/rules/bid-poker-game';
import { BidPokerResult, Standing } from '../classes/rules/standings';

/** The table as a page hears it: the changes its session applied live, counted, and the game */
export interface HeardBidTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    /** The catalogues drawn live */
    readonly catalogues: number;
    /** The kinds of the events of the game */
    readonly events: ReadonlyArray<BidEventKind>;
    readonly result: Readonly<BidPokerResult> | null;
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, the deck shuffled into the
 * catalogue, the coins of a lot sold, the cards of a lot discarded, and the end of the game, won, lost as a pig or ended
 * without a prize for the local player, won for a spectator
 */
export function tableSounds(before: Readonly<HeardBidTable>, after: Readonly<HeardBidTable>, me: number | null): ReadonlyArray<OneShotSoundEffect> {
    const sounds: OneShotSoundEffect[] = [];
    const told: ReadonlySet<BidEventKind> = new Set(after.events.slice(before.events.length));

    if (after.seatsTaken > before.seatsTaken) {
        sounds.push(SoundEffect.SEAT_TAKEN);
    }
    if (after.catalogues > before.catalogues) {
        sounds.push(SoundEffect.POKER_SHUFFLE);
    }
    if (told.has(BidEventKind.SOLD)) {
        sounds.push(SoundEffect.CHIPS);
    }
    if (told.has(BidEventKind.DISCARDS)) {
        sounds.push(SoundEffect.POKER_DEAL);
    }
    if (after.result !== null && before.result === null) {
        sounds.push(endSound(me === null ? null : after.result.standings[me]));
    }

    return sounds;
}

function endSound(standing: Readonly<Standing> | null): OneShotSoundEffect {
    if (standing?.pig) {
        return SoundEffect.GAME_LOST;
    }
    return standing === null || standing.prize > 0 ? SoundEffect.GAME_WON : SoundEffect.GAME_DRAW;
}
