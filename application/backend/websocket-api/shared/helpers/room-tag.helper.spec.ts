import { describe, expect, test } from 'vitest';
import { MAX_ROOM_TAG, randomRoomTag, tagRoomName } from './room-tag.helper';

describe('room tag helper', () => {
    test('should write the tag of a room with all its digits, after its name', () => {
        expect(tagRoomName('friday', 42)).toEqual('friday#000042');
        expect(tagRoomName('friday', MAX_ROOM_TAG)).toEqual('friday#999999');
    });

    test('should draw a whole tag from 0 to the highest one', () => {
        const tag: number = randomRoomTag();

        expect(Number.isInteger(tag)).toBe(true);
        expect(tag).toBeGreaterThanOrEqual(0);
        expect(tag).toBeLessThanOrEqual(MAX_ROOM_TAG);
    });
});
