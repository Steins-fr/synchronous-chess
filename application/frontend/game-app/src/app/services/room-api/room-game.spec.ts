import { isRoomGame, RoomGame } from '@protocol/room-game.enum';
import { describe, expect, test } from 'vitest';

// The game of the protocol shared with the websocket API, which checks the one of a request with it
describe('RoomGame', () => {
    test.each<[unknown, boolean]>([
        [RoomGame.CHESS, true],
        [RoomGame.CHAT, true],
        [RoomGame.SEVENTEEN_POKER, true],
        [RoomGame.RUSSIAN_ROULETTE, true],
        ['go', false],
        [undefined, false],
    ])('should tell whether %s is a game', (value: unknown, isGame: boolean) => {
        expect(isRoomGame(value)).toEqual(isGame);
    });
});
