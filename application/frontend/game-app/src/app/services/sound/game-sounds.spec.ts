import { describe, expect, test } from 'vitest';
import { SoundEffect } from './enums/sound-effect.enum';
import { gameEndSound, seatTaken } from './game-sounds';

describe('gameEndSound', () => {
    test('should tell a draw, a game won by the local player or a spectator, or lost', () => {
        expect(gameEndSound(null, 0)).toEqual(SoundEffect.GAME_DRAW);
        expect(gameEndSound(1, 1)).toEqual(SoundEffect.GAME_WON);
        expect(gameEndSound(1, null)).toEqual(SoundEffect.GAME_WON);
        expect(gameEndSound(1, 0)).toEqual(SoundEffect.GAME_LOST);
    });

    test('should tell a seat taken, by a participant or by another one, not a seat left', () => {
        expect(seatTaken([undefined, 'bob'], ['alice', 'bob'])).toBe(true);
        expect(seatTaken(['alice', null], ['carol', null])).toBe(true);
        expect(seatTaken(['alice', 'bob'], [null, 'bob'])).toBe(false);
        expect(seatTaken(['alice', undefined], ['alice', undefined])).toBe(false);
    });
});
