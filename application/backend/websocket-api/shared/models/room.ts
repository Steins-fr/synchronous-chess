import { RoomGame } from '@protocol/room-game.enum';
import Player from './player';

export default interface Room {
    id: string;
    connectionId: string;
    hostPlayer: string;
    maxPlayer: number;
    game: RoomGame;
    /** When the room was created, an ISO 8601 date in UTC: its order as a text is its order in time */
    createdAt: string;
    /** The search key of its name (search.helper): the sort key of the index by name */
    nameKey: string;
    /** Set for a private room: the hash of its password (password.helper) */
    passwordHash?: string;
    /**
     * Of a private room: the wrong passwords given in a row by each client, by the hash of its IP (source.helper), until
     * its right one, or until the room refuses its passwords for a while
     */
    passwordFailures?: Record<string, number>;
    /** Of a private room: until when the room refuses the passwords of a client, in epoch seconds, by the hash of its IP */
    passwordLocks?: Record<string, number>;
    players: Player[];
    queue: Player[];
    /** SHA-256 of the token of each player of the room, by name: the host reconnects the room with its own */
    tokenHashes: Record<string, string>;
    /**
     * Set while the host is disconnected, in epoch seconds: the room waits until then for the host to reconnect, then
     * no longer exists. The TTL of the table deletes it afterwards, within a few days
     */
    expiresAt?: number;
}
