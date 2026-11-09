import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { EdenEventKind } from '../classes/rules/eden-game-state';
import { EdenResult } from '../classes/rules/standings';
import { HeardEdenTable, tableSounds } from './table-sound.helper';

const EMPTY: HeardEdenTable = { seatsTaken: 0, events: [], lostParadise: false, result: null };
const RESULT: EdenResult = { winners: [1], standings: [] };
const { COUNTED, MISSED, OUT } = EdenEventKind;

describe('tableSounds', () => {
    test.each([
        { name: 'a seat taken', after: { ...EMPTY, seatsTaken: 1 }, me: 0, sounds: [SoundEffect.SEAT_TAKEN] },
        { name: 'the apples counted', after: { ...EMPTY, events: [MISSED, COUNTED] }, me: 0, sounds: [SoundEffect.POKER_CARD_TURN] },
        { name: 'the local player out of paradise', after: { ...EMPTY, events: [COUNTED, OUT], lostParadise: true }, me: 0,
            sounds: [SoundEffect.POKER_CARD_TURN, SoundEffect.GAME_LOST] },
        { name: 'the game won', after: { ...EMPTY, result: RESULT }, me: 1, sounds: [SoundEffect.GAME_WON] },
        { name: 'the game lost, out of paradise in the last round, once', after: { ...EMPTY, lostParadise: true, result: RESULT }, me: 0,
            sounds: [SoundEffect.GAME_LOST] },
        { name: 'the game over for a spectator', after: { ...EMPTY, result: RESULT }, me: null, sounds: [SoundEffect.GAME_WON] },
        { name: 'the game over without winner for a spectator', after: { ...EMPTY, result: { ...RESULT, winners: [] } }, me: null, sounds: [SoundEffect.GAME_DRAW] },
    ])('should play $name', ({ after, me, sounds }) => {
        expect(tableSounds(EMPTY, after, me)).toEqual(sounds);
    });

    test('should play nothing at the end for a player out of paradise before, nor for what it heard already', () => {
        // Given
        const before: HeardEdenTable = { seatsTaken: 3, events: [COUNTED], lostParadise: true, result: null };

        // Then
        expect(tableSounds(before, { ...before, result: RESULT }, 0)).toEqual([]);
        expect(tableSounds(before, before, 0)).toEqual([]);
    });
});
