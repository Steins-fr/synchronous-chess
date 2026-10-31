import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { LiveTable } from '../classes/game-sessions/seventeen-poker-session';
import { HandEnd, HandOutcome } from '../classes/rules/poker-match';
import { PokerSeat } from '../classes/rules/poker-seat';
import { SOUND_GAP } from '@app/services/sound/game-sounds';
import { HAND_ENDING, DEAL_STAGGER, HeardTable, tableSounds } from './table-sound.helper';

describe('tableSounds', () => {
    const live: LiveTable = { deals: 1, draws: [0, 0], chips: 1, outcomes: 0 };
    const table: HeardTable = { seatsTaken: 2, live, held: false, cards: 5, outcome: null, result: null };

    function outcome(end: HandEnd, winner: PokerSeat | null): Readonly<HandOutcome> {
        return { end, winner, pot: 10, gains: [0, 0], hands: null };
    }

    /** The table once a hand ended live */
    function ended(hand: Readonly<HandOutcome>): HeardTable {
        return { ...table, live: { ...live, outcomes: 1 }, outcome: hand };
    }

    test('should tell nothing when the table did not change', () => {
        expect(tableSounds(table, { ...table }, PokerSeat.ONE)).toEqual([]);
    });

    test('should tell a seat taken live', () => {
        expect(tableSounds(table, { ...table, seatsTaken: 3 }, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.SEAT_TAKEN, delay: 0 }]);
    });

    test('should tell a new deck shuffled live, its cards waiting for it to show shuffled', () => {
        expect(tableSounds(table, { ...table, live: { ...live, deals: 2 }, held: true }, PokerSeat.ONE))
            .toEqual([{ effect: SoundEffect.POKER_SHUFFLE, delay: 0 }]);
    });

    test('should tell each card of the hands once their deck showed shuffled, the hands dealt together', () => {
        // Given: the deck showed shuffled, a hand holding 5 cards
        const before: HeardTable = { ...table, held: true };

        // When, Then
        expect(tableSounds(before, table, PokerSeat.ONE)).toEqual([0, 1, 2, 3, 4].map((index: number) => ({ effect: SoundEffect.POKER_DEAL, delay: index * DEAL_STAGGER })));
        expect(tableSounds(before, { ...table, held: true }, PokerSeat.ONE)).toEqual([]);
    });

    test('should tell the cards drawn live at an exchange, the most of a hand, none while the deck shows shuffled', () => {
        // Given: the second hand draws two cards
        const after: HeardTable = { ...table, live: { ...live, draws: [0, 2] } };

        // When, Then
        expect(tableSounds(table, after, PokerSeat.ONE)).toEqual([
            { effect: SoundEffect.POKER_DEAL, delay: 0 },
            { effect: SoundEffect.POKER_DEAL, delay: DEAL_STAGGER },
        ]);
        expect(tableSounds({ ...table, held: true }, { ...after, held: true }, PokerSeat.ONE)).toEqual([]);
    });

    test('should tell the chips moved live', () => {
        expect(tableSounds(table, { ...table, live: { ...live, chips: 2 } }, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.CHIPS, delay: 0 }]);
    });

    test('should tell a fold, then the pot won by the local player or lost once the fold showed, in place of the chips moved', () => {
        // Given
        const after: HeardTable = { ...ended(outcome(HandEnd.FOLD, PokerSeat.ONE)), live: { ...live, chips: 2, outcomes: 1 } };

        // When, Then
        expect(tableSounds(table, after, PokerSeat.ONE)).toEqual([
            { effect: SoundEffect.POKER_FOLD, delay: 0 },
            { effect: SoundEffect.POKER_POT_WON, delay: HAND_ENDING },
        ]);
        expect(tableSounds(table, after, PokerSeat.TWO)).toEqual([
            { effect: SoundEffect.POKER_FOLD, delay: 0 },
            { effect: SoundEffect.POKER_POT_LOST, delay: HAND_ENDING },
        ]);
    });

    test('should tell the cards turned at the showdown, then the pot won for a spectator, or split, once they turned', () => {
        expect(tableSounds(table, ended(outcome(HandEnd.SHOWDOWN, PokerSeat.TWO)), null)).toEqual([
            { effect: SoundEffect.POKER_CARD_TURN, delay: 0 },
            { effect: SoundEffect.POKER_POT_WON, delay: HAND_ENDING },
        ]);
        expect(tableSounds(table, ended(outcome(HandEnd.SHOWDOWN, null)), PokerSeat.ONE)).toEqual([
            { effect: SoundEffect.POKER_CARD_TURN, delay: 0 },
            { effect: SoundEffect.CHIPS, delay: HAND_ENDING },
        ]);
    });

    test('should tell the antes of a no contest going to the bank', () => {
        expect(tableSounds(table, ended(outcome(HandEnd.NO_CONTEST, null)), PokerSeat.ONE)).toEqual([{ effect: SoundEffect.CHIPS, delay: 0 }]);
    });

    test('should tell the end of the match after the end of its last hand, won, lost or drawn for the local player', () => {
        // Given
        const after: HeardTable = { ...ended(outcome(HandEnd.FOLD, PokerSeat.ONE)), result: { winner: PokerSeat.ONE, stacks: [300, 0] } };

        // When, Then
        expect(tableSounds(table, after, PokerSeat.TWO)).toEqual([
            { effect: SoundEffect.POKER_FOLD, delay: 0 },
            { effect: SoundEffect.POKER_POT_LOST, delay: HAND_ENDING },
            { effect: SoundEffect.GAME_LOST, delay: HAND_ENDING + SOUND_GAP },
        ]);
        expect(tableSounds(after, { ...after }, PokerSeat.TWO)).toEqual([]);
        expect(tableSounds(table, { ...ended(outcome(HandEnd.NO_CONTEST, null)), result: { winner: null, stacks: [145, 145] } }, PokerSeat.ONE)).toEqual([
            { effect: SoundEffect.CHIPS, delay: 0 },
            { effect: SoundEffect.GAME_DRAW, delay: SOUND_GAP },
        ]);
    });

    test('should tell nothing of the history of the room: its seats, its hands and its match over count no change', () => {
        // Given: a table the history changed, its counters not moved
        const after: HeardTable = { ...table, cards: 3, outcome: outcome(HandEnd.SHOWDOWN, PokerSeat.ONE), result: { winner: PokerSeat.ONE, stacks: [300, 0] } };

        // When, Then
        expect(tableSounds(table, after, PokerSeat.ONE)).toEqual([]);
    });
});
