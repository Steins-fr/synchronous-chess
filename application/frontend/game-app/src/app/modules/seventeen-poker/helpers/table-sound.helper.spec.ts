import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { HandEnd, HandOutcome } from '../classes/rules/poker-match';
import { PokerSeat } from '../classes/rules/poker-seat';
import { HAND_ENDING, DEAL_STAGGER, HeardTable, SOUND_GAP, tableSounds } from './table-sound.helper';

describe('tableSounds', () => {
    const table: HeardTable = { seats: ['alice', 'bob'], deck: null, hands: [[], []], chips: { stacks: [150, 150], bets: [0, 0], pot: 0 }, outcomes: [], result: null };

    function outcome(end: HandEnd, winner: PokerSeat | null): Readonly<HandOutcome> {
        return { end, winner, pot: 10, gains: [0, 0], hands: null };
    }

    test('should tell nothing when the table did not change', () => {
        expect(tableSounds(table, { ...table }, PokerSeat.ONE)).toEqual([]);
    });

    test('should tell a seat taken, not a seat left', () => {
        expect(tableSounds({ ...table, seats: ['alice', null] }, table, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.SEAT_TAKEN, delay: 0 }]);
        expect(tableSounds(table, { ...table, seats: ['alice', null] }, PokerSeat.ONE)).toEqual([]);
    });

    test('should tell a new deck shuffled', () => {
        expect(tableSounds(table, { ...table, deck: 'd1' }, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.POKER_SHUFFLE, delay: 0 }]);
        expect(tableSounds({ ...table, deck: 'd1' }, { ...table, deck: 'd2' }, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.POKER_SHUFFLE, delay: 0 }]);
        expect(tableSounds({ ...table, deck: 'd1' }, { ...table, deck: 'd1' }, PokerSeat.ONE)).toEqual([]);
    });

    test('should tell each card entering the hands, the hands dealt together', () => {
        // Given: the second hand draws two cards in place of two others
        const before: HeardTable = { ...table, hands: [['d:0', 'd:1'], ['d:2', 'd:3', 'd:4']] };
        const after: HeardTable = { ...table, hands: [['d:0', 'd:1'], ['d:2', 'd:5', 'd:6']] };

        // When, Then
        expect(tableSounds(before, after, PokerSeat.ONE)).toEqual([
            { effect: SoundEffect.POKER_DEAL, delay: 0 },
            { effect: SoundEffect.POKER_DEAL, delay: DEAL_STAGGER },
        ]);
    });

    test('should tell the chips moved', () => {
        expect(tableSounds(table, { ...table, chips: { stacks: [140, 150], bets: [10, 0], pot: 0 } }, PokerSeat.ONE))
            .toEqual([{ effect: SoundEffect.CHIPS, delay: 0 }]);
    });

    test('should tell a fold, then the pot won by the local player or lost once the fold showed, in place of the chips moved', () => {
        // Given
        const after: HeardTable = { ...table, chips: { stacks: [160, 140], bets: [0, 0], pot: 0 }, outcomes: [outcome(HandEnd.FOLD, PokerSeat.ONE)] };

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
        expect(tableSounds(table, { ...table, outcomes: [outcome(HandEnd.SHOWDOWN, PokerSeat.TWO)] }, null)).toEqual([
            { effect: SoundEffect.POKER_CARD_TURN, delay: 0 },
            { effect: SoundEffect.POKER_POT_WON, delay: HAND_ENDING },
        ]);
        expect(tableSounds(table, { ...table, outcomes: [outcome(HandEnd.SHOWDOWN, null)] }, PokerSeat.ONE)).toEqual([
            { effect: SoundEffect.POKER_CARD_TURN, delay: 0 },
            { effect: SoundEffect.CHIPS, delay: HAND_ENDING },
        ]);
    });

    test('should tell the antes of a no contest going to the bank', () => {
        expect(tableSounds(table, { ...table, outcomes: [outcome(HandEnd.NO_CONTEST, null)] }, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.CHIPS, delay: 0 }]);
    });

    test('should tell the end of the match after the end of its last hand, won, lost or drawn for the local player', () => {
        // Given
        const after: HeardTable = { ...table, outcomes: [outcome(HandEnd.FOLD, PokerSeat.ONE)], result: { winner: PokerSeat.ONE, stacks: [300, 0] } };

        // When, Then
        expect(tableSounds(table, after, PokerSeat.TWO)).toEqual([
            { effect: SoundEffect.POKER_FOLD, delay: 0 },
            { effect: SoundEffect.POKER_POT_LOST, delay: HAND_ENDING },
            { effect: SoundEffect.GAME_LOST, delay: HAND_ENDING + SOUND_GAP },
        ]);
        expect(tableSounds(after, { ...after }, PokerSeat.TWO)).toEqual([]);
        expect(tableSounds(table, { ...table, result: { winner: null, stacks: [150, 150] } }, PokerSeat.ONE)).toEqual([{ effect: SoundEffect.GAME_DRAW, delay: 0 }]);
    });
});
