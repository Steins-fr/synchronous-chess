import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound, seatTaken, SOUND_GAP } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { HandEnd, HandOutcome, MatchResult } from '../classes/rules/poker-match';
import { PokerSeat } from '../classes/rules/poker-seat';
import { chipTransfers, TableChips } from './chip-transfers.helper';

/** The table as a page hears it */
export interface HeardTable {
    /** The participant on each seat */
    readonly seats: ReadonlyArray<string | null>;
    /** The id of the deck of the hand, shuffled by both players before the deal */
    readonly deck: string | null;
    /** The ids of the cards of each hand */
    readonly hands: ReadonlyArray<ReadonlyArray<string>>;
    readonly chips: Readonly<TableChips>;
    /** The outcome of each hand played in the match */
    readonly outcomes: ReadonlyArray<Readonly<HandOutcome>>;
    /** The result of the match, once over */
    readonly result: Readonly<MatchResult> | null;
}

/** A sound, later by its delay in seconds */
export interface TimedSound {
    readonly effect: OneShotSoundEffect;
    readonly delay: number;
}

/** The time between the cards dealt into a hand, in seconds, as the hand shows them (--app-motion-stagger) */
export const DEAL_STAGGER: number = 0.16;
/**
 * The time the end of a hand shows before its pot flies, in seconds (--app-motion-slow): the cards turned over at the
 * showdown, or the hand folded fading
 */
export const HAND_ENDING: number = 0.8;

/** The chips of the pot going to the winner, a cheer for the local player or a spectator, else a loss */
function potSound(winner: PokerSeat | null, mySeat: PokerSeat | null): OneShotSoundEffect {
    if (winner === null) {
        // Split, or gone to the bank
        return SoundEffect.CHIPS;
    }
    return mySeat === null || mySeat === winner ? SoundEffect.POKER_POT_WON : SoundEffect.POKER_POT_LOST;
}

/** The end of a hand: the fold, or the cards turned at the showdown, then the pot going to its winner once it showed */
function outcomeSounds({ end, winner }: Readonly<HandOutcome>, mySeat: PokerSeat | null): ReadonlyArray<TimedSound> {
    const pot: OneShotSoundEffect = potSound(winner, mySeat);

    switch (end) {
        case HandEnd.FOLD:
            return [{ effect: SoundEffect.POKER_FOLD, delay: 0 }, { effect: pot, delay: HAND_ENDING }];
        case HandEnd.SHOWDOWN:
            return [{ effect: SoundEffect.POKER_CARD_TURN, delay: 0 }, { effect: pot, delay: HAND_ENDING }];
        case HandEnd.NO_CONTEST:
            return [{ effect: pot, delay: 0 }];
    }
}

/**
 * The sounds of a change of the table, from what the page last heard: a seat taken, a new deck shuffled, each card dealt into a hand as
 * it flies in, the chips moved by a bet, and the end of a hand, whose pot sound replaces the one of the chips, then the end
 * of the match, won, lost or drawn for the local player
 */
export function tableSounds(before: Readonly<HeardTable>, after: Readonly<HeardTable>, mySeat: PokerSeat | null): ReadonlyArray<TimedSound> {
    const sounds: TimedSound[] = [];

    if (seatTaken(before.seats, after.seats)) {
        sounds.push({ effect: SoundEffect.SEAT_TAKEN, delay: 0 });
    }

    if (after.deck !== null && after.deck !== before.deck) {
        sounds.push({ effect: SoundEffect.POKER_SHUFFLE, delay: 0 });
    }

    // The hands are dealt together, each card of a hand after the previous one
    const dealt: number = Math.max(0, ...after.hands.map((hand: ReadonlyArray<string>, seat: number) => {
        const held: ReadonlySet<string> = new Set<string>(before.hands[seat]);
        return hand.filter((id: string) => !held.has(id)).length;
    }));
    sounds.push(...Array.from({ length: dealt }, (_: unknown, index: number): TimedSound => ({ effect: SoundEffect.POKER_DEAL, delay: index * DEAL_STAGGER })));

    const outcome: Readonly<HandOutcome> | undefined = after.outcomes.length > before.outcomes.length ? after.outcomes.at(-1) : undefined;
    if (outcome !== undefined) {
        sounds.push(...outcomeSounds(outcome, mySeat));
    } else if (chipTransfers(before.chips, after.chips).length > 0) {
        sounds.push({ effect: SoundEffect.CHIPS, delay: 0 });
    }

    if (after.result !== null && before.result === null) {
        // After the sounds of the hand ending the match
        const delay: number = sounds.length === 0 ? 0 : Math.max(...sounds.map((sound: TimedSound) => sound.delay)) + SOUND_GAP;
        sounds.push({ effect: gameEndSound(after.result.winner, mySeat), delay });
    }

    return sounds;
}
