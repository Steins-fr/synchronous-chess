import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { RouletteSeat } from '../classes/rules/roulette-seat';
import { HeardTable, tableSounds } from './table-sound.helper';

describe('tableSounds', () => {
    const table: HeardTable = { seatsTaken: 2, loads: 2, aim: null, result: null };

    test('should tell nothing when the table did not change', () => {
        expect(tableSounds(table, { ...table }, RouletteSeat.ONE)).toEqual([]);
    });

    test('should tell a seat taken live', () => {
        expect(tableSounds({ ...table, seatsTaken: 1 }, table, RouletteSeat.ONE)).toEqual([SoundEffect.SEAT_TAKEN]);
    });

    test('should tell the bullets of a player loaded live', () => {
        expect(tableSounds({ ...table, loads: 1 }, table, RouletteSeat.ONE)).toEqual([SoundEffect.ROULETTE_LOAD]);
    });

    test('should tell the hammer cocked as the revolver aims at a player, then at the other one or at the sky', () => {
        expect(tableSounds(table, { ...table, aim: '0' }, RouletteSeat.ONE)).toEqual([SoundEffect.ROULETTE_COCK]);
        expect(tableSounds({ ...table, aim: '0' }, { ...table, aim: 'sky' }, RouletteSeat.ONE)).toEqual([SoundEffect.ROULETTE_COCK]);
        expect(tableSounds({ ...table, aim: '0' }, { ...table, aim: '0' }, RouletteSeat.ONE)).toEqual([]);
        expect(tableSounds({ ...table, aim: '0' }, table, RouletteSeat.ONE)).toEqual([]);
    });

    test('should tell the end of the game, won, lost or drawn for the local player', () => {
        const won: HeardTable = { ...table, result: { winner: RouletteSeat.ONE, deaths: [0, 1], stacks: [150, 150] } };
        expect(tableSounds(table, won, RouletteSeat.ONE)).toEqual([SoundEffect.GAME_WON]);
        expect(tableSounds(table, won, RouletteSeat.TWO)).toEqual([SoundEffect.GAME_LOST]);
        expect(tableSounds(won, { ...won }, RouletteSeat.TWO)).toEqual([]);
        expect(tableSounds(table, { ...table, result: { winner: null, deaths: [1, 1], stacks: [150, 150] } }, null)).toEqual([SoundEffect.GAME_DRAW]);
    });
});
