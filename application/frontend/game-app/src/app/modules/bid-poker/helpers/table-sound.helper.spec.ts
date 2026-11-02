import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { BidEventKind } from '../classes/rules/bid-poker-game';
import { BidPokerResult, Standing } from '../classes/rules/standings';
import { HeardBidTable, tableSounds } from './table-sound.helper';

const QUIET: HeardBidTable = { seatsTaken: 0, catalogues: 0, events: [], result: null };
const standing = (pig: boolean, prize: number): Standing => ({ player: 0, best: null, place: pig ? null : 1, pig, prize, fine: 0, balance: 0 });
const over = (...standings: Standing[]): BidPokerResult => ({ standings, pigs: 1, unpaid: 0 });

describe('tableSounds', () => {
    test('should hear a seat taken, the catalogue drawn, a lot sold and discards', () => {
        // When
        const sounds = tableSounds(QUIET, {
            seatsTaken: 1, catalogues: 1, events: [BidEventKind.SOLD, BidEventKind.UNSOLD, BidEventKind.DISCARDS], result: null,
        }, null);

        // Then
        expect(sounds).toEqual([SoundEffect.SEAT_TAKEN, SoundEffect.POKER_SHUFFLE, SoundEffect.CHIPS, SoundEffect.POKER_DEAL]);
    });

    test('should hear the events told since the latest change only', () => {
        expect(tableSounds({ ...QUIET, events: [BidEventKind.SOLD] }, { ...QUIET, events: [BidEventKind.SOLD, BidEventKind.UNSOLD] }, null)).toEqual([]);
    });

    test.each([
        { me: null, sound: SoundEffect.GAME_WON },
        { me: 0, sound: SoundEffect.GAME_LOST },
        { me: 1, sound: SoundEffect.GAME_WON },
        { me: 2, sound: SoundEffect.GAME_DRAW },
    ])('should hear the end of the game for the player $me', ({ me, sound }) => {
        // When
        const sounds = tableSounds(QUIET, { ...QUIET, result: over(standing(true, 0), standing(false, 100), standing(false, 0)) }, me);

        // Then
        expect(sounds).toEqual([sound]);
    });
});
