import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { gameEndSound, SOUND_GAP } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { LiveTable } from '../classes/game-sessions/seventeen-poker-session';
import { HandEnd, HandOutcome, MatchResult } from '../classes/rules/poker-match';
import { PokerSeat } from '../classes/rules/poker-seat';

/** The table as a page hears it: the changes its session applied live, counted, and what tells their sounds */
export interface HeardTable {
    /** The seats taken live */
    readonly seatsTaken: number;
    readonly live: Readonly<LiveTable>;
    /** The deck of the hand shows shuffled, as long as the sound of its shuffle: its cards wait for it */
    readonly held: boolean;
    /** The most cards of a hand, all dealt into it once its deck showed shuffled */
    readonly cards: number;
    /** The outcome of the latest hand of the match */
    readonly outcome: Readonly<HandOutcome> | null;
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

/**
 * The end of a hand: the fold, or the cards turned at the showdown, then the pot going to its winner once it showed, at
 * once when the user asks for less motion (the pot flies without waiting)
 */
function outcomeSounds({ end, winner }: Readonly<HandOutcome>, mySeat: PokerSeat | null, reducedMotion: boolean): ReadonlyArray<TimedSound> {
    const pot: OneShotSoundEffect = potSound(winner, mySeat);
    const ending: number = reducedMotion ? 0 : HAND_ENDING;

    switch (end) {
        case HandEnd.FOLD:
            return [{ effect: SoundEffect.POKER_FOLD, delay: 0 }, { effect: pot, delay: ending }];
        case HandEnd.SHOWDOWN:
            return [{ effect: SoundEffect.POKER_CARD_TURN, delay: 0 }, { effect: pot, delay: ending }];
        case HandEnd.NO_CONTEST:
            return [{ effect: pot, delay: 0 }];
    }
}

/**
 * The cards entering the hands, the most of a hand: none while the deck of the hand shows shuffled, the whole hands once
 * it showed, else the cards drawn at an exchange
 */
function dealtCards(before: Readonly<HeardTable>, after: Readonly<HeardTable>): number {
    if (after.held) {
        return 0;
    }

    // A card drawn while the deck showed shuffled waits for it too: it is dealt with its hand
    if (before.held) {
        return after.cards;
    }

    return Math.max(...after.live.draws.map((drawn: number, seat: number) => drawn - before.live.draws[seat]));
}

/**
 * The sounds of the changes of the table its session applied live since the page last heard it: a seat taken, a new deck
 * shuffled, each card dealt into a hand as it flies in, the chips moved by the antes or a bet, and the end of a hand,
 * whose pot sound replaces the one of the chips, then the end of the match, won, lost or drawn for the local player. The
 * history of the room, counting none, plays none. When the user asks for less motion, the sounds waiting for an animation
 * do not: the cards of the hands, shown at once, are heard once, and the pot as soon as the hand ends
 */
export function tableSounds(before: Readonly<HeardTable>, after: Readonly<HeardTable>, mySeat: PokerSeat | null, reducedMotion: boolean = false): ReadonlyArray<TimedSound> {
    const sounds: TimedSound[] = [];

    if (after.seatsTaken !== before.seatsTaken) {
        sounds.push({ effect: SoundEffect.SEAT_TAKEN, delay: 0 });
    }

    if (after.live.deals !== before.live.deals) {
        sounds.push({ effect: SoundEffect.POKER_SHUFFLE, delay: 0 });
    }

    // The hands are dealt together, each card of a hand after the previous one, or all at once without motion
    const cards: number = dealtCards(before, after);
    const dealt: number = reducedMotion ? Math.min(cards, 1) : cards;
    sounds.push(...Array.from({ length: dealt }, (_: unknown, index: number): TimedSound => ({ effect: SoundEffect.POKER_DEAL, delay: index * DEAL_STAGGER })));

    // A hand over live: the latest outcome of the match is its own
    const outcome: Readonly<HandOutcome> | null = after.live.outcomes === before.live.outcomes ? null : after.outcome;
    if (outcome !== null) {
        sounds.push(...outcomeSounds(outcome, mySeat, reducedMotion));
    } else if (after.live.chips !== before.live.chips) {
        sounds.push({ effect: SoundEffect.CHIPS, delay: 0 });
    }

    // The result of a match comes with the outcome of its last hand
    if (outcome !== null && after.result !== null) {
        // After the sounds of the hand ending the match
        const delay: number = Math.max(...sounds.map((sound: TimedSound) => sound.delay)) + SOUND_GAP;
        sounds.push({ effect: gameEndSound(after.result.winner, mySeat), delay });
    }

    return sounds;
}
