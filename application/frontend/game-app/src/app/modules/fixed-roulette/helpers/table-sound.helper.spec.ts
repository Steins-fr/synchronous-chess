import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SOUND_GAP } from '@app/services/sound/game-sounds';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { describe, expect, test } from 'vitest';
import {
    CheatKind, FixedRouletteEvent, FixedRouletteEventKind, FixedRoulettePhase, FixedRouletteResult, MatchEnd, SettledEvent,
} from '../classes/rules/fixed-roulette-game-state';
import { Bets, Side } from '../classes/rules/fixed-roulette-rules';
import { settle } from '../classes/rules/settlement';
import { BALL_DROP, HeardFixedTable, tableSounds, TimedSound } from './table-sound.helper';

const EMPTY: HeardFixedTable = { seatsTaken: 0, events: [], result: null };
/** A game of bob, croupier, and alice: the ball on the pocket of the croupier alone */
const settled = (ball: number, croupierBets: Bets = [0, 0, 40, 0], punterBets: Bets = [40, 0, 0, 0]): SettledEvent => {
    const bets = { [Side.CROUPIER]: croupierBets, [Side.PUNTER]: punterBets };
    return { kind: FixedRouletteEventKind.SETTLED, round: 0, croupier: 1, ball, bets, settlement: settle(bets, ball) };
};
const PLACED: FixedRouletteEvent = { kind: FixedRouletteEventKind.PLACED, round: 0, croupier: 1, bets: [0, 0, 40, 0] };
const BET: FixedRouletteEvent = { kind: FixedRouletteEventKind.BET, round: 0, punter: 0, bets: [40, 0, 0, 0] };
const late = (phase: FixedRoulettePhase): FixedRouletteEvent => ({ kind: FixedRouletteEventKind.LATE, round: 0, player: 1, phase });
const RESULT: FixedRouletteResult = { winner: 1, end: MatchEnd.GAMES, cause: null, chips: [460, 540] };
const at = (effect: OneShotSoundEffect, delay: number = 0): TimedSound => ({ effect, delay });

describe('tableSounds', () => {
    test.each<{ name: string; after: HeardFixedTable; me: number | null; sounds: ReadonlyArray<TimedSound> }>([
        { name: 'a seat taken', after: { ...EMPTY, seatsTaken: 1 }, me: null, sounds: [at(SoundEffect.SEAT_TAKEN)] },
        { name: 'the chips of the bets', after: { ...EMPTY, events: [PLACED, BET] }, me: 0, sounds: [at(SoundEffect.CHIPS), at(SoundEffect.CHIPS)] },
        { name: 'the ball revealed, then the chips won by the local player', after: { ...EMPTY, events: [settled(3)] }, me: 1,
            sounds: [at(SoundEffect.FIXED_BALL_DROP), at(SoundEffect.POKER_POT_WON, BALL_DROP)] },
        { name: 'the ball revealed, then the chips lost by the local player', after: { ...EMPTY, events: [settled(3)] }, me: 0,
            sounds: [at(SoundEffect.FIXED_BALL_DROP), at(SoundEffect.POKER_POT_LOST, BALL_DROP)] },
        { name: 'the ball revealed, then the chips back to the local player who neither won nor lost',
            after: { ...EMPTY, events: [settled(1, [1, 0, 0, 0], [1, 0, 0, 0])] }, me: 0,
            sounds: [at(SoundEffect.FIXED_BALL_DROP), at(SoundEffect.CHIPS, BALL_DROP)] },
        { name: 'the ball revealed, then the chips moved, for a spectator', after: { ...EMPTY, events: [settled(3)] }, me: null,
            sounds: [at(SoundEffect.FIXED_BALL_DROP), at(SoundEffect.CHIPS, BALL_DROP)] },
        { name: 'the last game settled, then the match won', after: { ...EMPTY, events: [settled(3)], result: RESULT }, me: 1,
            sounds: [at(SoundEffect.FIXED_BALL_DROP), at(SoundEffect.POKER_POT_WON, BALL_DROP), at(SoundEffect.GAME_WON, BALL_DROP + SOUND_GAP)] },
        { name: 'a croupier late to place, the match lost at once', after: { ...EMPTY, events: [late(FixedRoulettePhase.PLACING)], result: RESULT }, me: 0,
            sounds: [at(SoundEffect.GAME_LOST)] },
        { name: 'the bets back of a punter late, then the end', after: { ...EMPTY, events: [late(FixedRoulettePhase.BETTING)], result: RESULT }, me: null,
            sounds: [at(SoundEffect.CHIPS), at(SoundEffect.GAME_WON, SOUND_GAP)] },
        { name: 'the bets back of a croupier cheating, then a draw', after: {
            ...EMPTY, events: [{ kind: FixedRouletteEventKind.CHEATED, round: 0, player: 1, reason: CheatKind.ILLEGAL_POCKET }], result: { ...RESULT, winner: null },
        }, me: 0, sounds: [at(SoundEffect.CHIPS), at(SoundEffect.GAME_DRAW, SOUND_GAP)] },
    ])('should play $name', ({ after, me, sounds }) => {
        expect(tableSounds(EMPTY, after, me)).toEqual(sounds);
    });

    test('should play nothing for what the page heard already', () => {
        // Given
        const heard: HeardFixedTable = { seatsTaken: 2, events: [PLACED, BET, settled(3)], result: RESULT };

        // Then
        expect(tableSounds(heard, heard, 0)).toEqual([]);
        expect(tableSounds(heard, { ...heard, seatsTaken: 1 }, 0)).toEqual([]);
    });
});
