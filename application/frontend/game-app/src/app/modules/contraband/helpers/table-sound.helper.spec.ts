import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { describe, expect, test } from 'vitest';
import { ContrabandEventKind } from '../classes/rules/contraband-game-state';
import { Team } from '../classes/rules/contraband-rules';
import { ContrabandResult } from '../classes/rules/standings';
import { HeardContrabandTable, tableSounds } from './table-sound.helper';

const EMPTY: HeardContrabandTable = { seatsTaken: 0, events: [], result: null };
const NORTH_WINS: ContrabandResult = { winner: Team.NORTH, totals: { [Team.NORTH]: 75, [Team.SOUTH]: -75 }, standings: [] };
const TIE: ContrabandResult = { winner: null, totals: { [Team.NORTH]: 0, [Team.SOUTH]: 0 }, standings: [] };
const { PACKED, CALLED, SETTLED } = ContrabandEventKind;

describe('tableSounds', () => {
    test.each([
        { name: 'a seat taken', after: { ...EMPTY, seatsTaken: 1 }, team: null, sounds: [SoundEffect.SEAT_TAKEN] },
        { name: 'the customs open', after: { ...EMPTY, events: [PACKED] }, team: Team.NORTH, sounds: [SoundEffect.CHESS_TURN_START] },
        { name: 'the trunk revealed', after: { ...EMPTY, events: [PACKED, CALLED, SETTLED] }, team: Team.NORTH, sounds: [SoundEffect.CHESS_TURN_START, SoundEffect.POKER_CARD_TURN] },
        { name: 'the match won', after: { ...EMPTY, result: NORTH_WINS }, team: Team.NORTH, sounds: [SoundEffect.GAME_WON] },
        { name: 'the match lost', after: { ...EMPTY, result: NORTH_WINS }, team: Team.SOUTH, sounds: [SoundEffect.GAME_LOST] },
        { name: 'the match over for a spectator', after: { ...EMPTY, result: NORTH_WINS }, team: null, sounds: [SoundEffect.GAME_WON] },
        { name: 'a tie', after: { ...EMPTY, result: TIE }, team: Team.SOUTH, sounds: [SoundEffect.GAME_DRAW] },
    ])('should play $name', ({ after, team, sounds }) => {
        expect(tableSounds(EMPTY, after, team)).toEqual(sounds);
    });

    test('should play nothing for what the page heard already', () => {
        // Given
        const before: HeardContrabandTable = { seatsTaken: 4, events: [PACKED, CALLED, SETTLED], result: NORTH_WINS };

        // Then
        expect(tableSounds(before, before, Team.NORTH)).toEqual([]);
    });
});
