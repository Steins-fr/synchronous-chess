import { ROOM_TAG_DIGITS, ROOM_TAG_SEPARATOR } from '@protocol/room-limits';
import { randomInt } from 'node:crypto';

/** The highest tag of a room: the tags of a name run out above it */
export const MAX_ROOM_TAG: number = 10 ** ROOM_TAG_DIGITS - 1;

/** The id of a room: its name and its tag, written with all its digits (`friday#000042`) */
export function tagRoomName(name: string, tag: number): string {
    return `${ name }${ ROOM_TAG_SEPARATOR }${ tag.toString().padStart(ROOM_TAG_DIGITS, '0') }`;
}

/** A tag drawn at random, from 0 to MAX_ROOM_TAG: rooms of the same name rarely draw the same one */
export function randomRoomTag(): number {
    return randomInt(0, MAX_ROOM_TAG + 1);
}
