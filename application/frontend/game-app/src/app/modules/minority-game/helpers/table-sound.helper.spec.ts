import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { MinorityEventKind } from '../classes/rules/minority-game-state';
import { MinorityVariant } from '../classes/rules/minority-rules';
import { MinorityResult } from '../classes/rules/standings';
import { HeardMinorityTable, tableSounds } from './table-sound.helper';

const EMPTY: HeardMinorityTable = { seatsTaken: 0, events: [], eliminated: false, result: null };
const RESULT: MinorityResult = { variant: MinorityVariant.ELIMINATION, winners: [1], standings: [] };
const { ASKED, COUNTED, MISSED } = MinorityEventKind;

describe('tableSounds', () => {
    test.each([
        { name: 'a seat taken', after: { ...EMPTY, seatsTaken: 1 }, me: 0, sounds: [SoundEffect.SEAT_TAKEN] },
        { name: 'a question asked', after: { ...EMPTY, events: [ASKED] }, me: 0, sounds: [SoundEffect.CHESS_TURN_START] },
        { name: 'the votes revealed', after: { ...EMPTY, events: [ASKED, MISSED, COUNTED] }, me: 0, sounds: [SoundEffect.CHESS_TURN_START, SoundEffect.POKER_CARD_TURN] },
        { name: 'the local player eliminated', after: { ...EMPTY, eliminated: true }, me: 0, sounds: [SoundEffect.GAME_LOST] },
        { name: 'the game won', after: { ...EMPTY, result: RESULT }, me: 1, sounds: [SoundEffect.GAME_WON] },
        { name: 'the game lost', after: { ...EMPTY, eliminated: true, result: RESULT }, me: 0, sounds: [SoundEffect.GAME_LOST] },
        { name: 'the game over for a spectator', after: { ...EMPTY, result: RESULT }, me: null, sounds: [SoundEffect.GAME_WON] },
    ])('should play $name', ({ after, me, sounds }) => {
        expect(tableSounds(EMPTY, after, me)).toEqual(sounds);
    });

    test('should play nothing at the end for a player eliminated before, nor for what it heard already', () => {
        // Given
        const before: HeardMinorityTable = { seatsTaken: 3, events: [ASKED], eliminated: true, result: null };

        // Then
        expect(tableSounds(before, { ...before, result: RESULT }, 0)).toEqual([]);
        expect(tableSounds(before, before, 0)).toEqual([]);
    });
});
