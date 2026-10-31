import { describe, expect, test } from 'vitest';
import { SoundEffect } from './enums/sound-effect.enum';
import { gameEndSound } from './game-sounds';

describe('gameEndSound', () => {
    test('should tell a draw, a game won by the local player or a spectator, or lost', () => {
        expect(gameEndSound(null, 0)).toEqual(SoundEffect.GAME_DRAW);
        expect(gameEndSound(1, 1)).toEqual(SoundEffect.GAME_WON);
        expect(gameEndSound(1, null)).toEqual(SoundEffect.GAME_WON);
        expect(gameEndSound(1, 0)).toEqual(SoundEffect.GAME_LOST);
    });
});
