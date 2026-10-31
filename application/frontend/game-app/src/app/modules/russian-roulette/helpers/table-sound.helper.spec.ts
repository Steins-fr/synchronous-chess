import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { RouletteSeat } from '../classes/rules/roulette-seat';
import { HeardTable, tableSounds } from './table-sound.helper';

describe('tableSounds', () => {
    const table: HeardTable = { seats: ['alice', 'bob'], loaded: 2, aim: null, chambers: [], chips: [150, 150, 0, 0], result: null };

    test('should tell nothing when the table did not change', () => {
        expect(tableSounds(table, { ...table }, RouletteSeat.ONE, false)).toEqual([]);
    });

    test('should tell a seat taken, not a seat left', () => {
        expect(tableSounds({ ...table, seats: ['alice', null] }, table, RouletteSeat.ONE, false)).toEqual([SoundEffect.SEAT_TAKEN]);
        expect(tableSounds(table, { ...table, seats: ['alice', null] }, RouletteSeat.ONE, false)).toEqual([]);
    });

    test('should tell the bullets of a player loaded', () => {
        expect(tableSounds({ ...table, loaded: 0 }, { ...table, loaded: 1 }, RouletteSeat.ONE, false)).toEqual([SoundEffect.ROULETTE_LOAD]);
        expect(tableSounds({ ...table, loaded: 1 }, { ...table, loaded: 0 }, RouletteSeat.ONE, false)).toEqual([]);
    });

    test('should tell the hammer cocked as the revolver aims at a player, then at the other one or at the sky', () => {
        expect(tableSounds(table, { ...table, aim: '0' }, RouletteSeat.ONE, false)).toEqual([SoundEffect.ROULETTE_COCK]);
        expect(tableSounds({ ...table, aim: '0' }, { ...table, aim: 'sky' }, RouletteSeat.ONE, false)).toEqual([SoundEffect.ROULETTE_COCK]);
        expect(tableSounds({ ...table, aim: '0' }, { ...table, aim: '0' }, RouletteSeat.ONE, false)).toEqual([]);
        expect(tableSounds({ ...table, aim: '0' }, table, RouletteSeat.ONE, false)).toEqual([]);
    });

    test('should tell the chamber fired at once on a hidden page only, the revolver firing it on a visible one', () => {
        expect(tableSounds(table, { ...table, chambers: [0] }, RouletteSeat.ONE, true)).toEqual([SoundEffect.ROULETTE_CLICK]);
        expect(tableSounds({ ...table, chambers: [0] }, { ...table, chambers: [0, 2] }, RouletteSeat.ONE, true)).toEqual([SoundEffect.ROULETTE_SHOT]);
        expect(tableSounds(table, { ...table, chambers: [1] }, RouletteSeat.ONE, false)).toEqual([]);
    });

    test('should tell the chips moved at once on a hidden page only, their flights on a visible one', () => {
        expect(tableSounds(table, { ...table, chips: [149, 150, 1, 0] }, RouletteSeat.ONE, true)).toEqual([SoundEffect.CHIPS]);
        expect(tableSounds(table, { ...table, chips: [149, 150, 1, 0] }, RouletteSeat.ONE, false)).toEqual([]);
        expect(tableSounds(table, { ...table }, RouletteSeat.ONE, true)).toEqual([]);
    });

    test('should tell the end of the game, won, lost or drawn for the local player', () => {
        const won: HeardTable = { ...table, result: { winner: RouletteSeat.ONE, deaths: [0, 1], stacks: [150, 150] } };
        expect(tableSounds(table, won, RouletteSeat.ONE, false)).toEqual([SoundEffect.GAME_WON]);
        expect(tableSounds(table, won, RouletteSeat.TWO, false)).toEqual([SoundEffect.GAME_LOST]);
        expect(tableSounds(won, { ...won }, RouletteSeat.TWO, false)).toEqual([]);
        expect(tableSounds(table, { ...table, result: { winner: null, deaths: [1, 1], stacks: [150, 150] } }, null, false)).toEqual([SoundEffect.GAME_DRAW]);
    });
});
