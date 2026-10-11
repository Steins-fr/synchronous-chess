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
    /** Set for a private room: the hash of its password (password.helper) */
    passwordHash?: string;
    /** The wrong passwords given in a row, until the right one, or until the room refuses the passwords for a while */
    passwordFailures?: number;
    /** Until when the room refuses the passwords, in epoch seconds, too many wrong ones given in a row */
    passwordLockedUntil?: number;
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
