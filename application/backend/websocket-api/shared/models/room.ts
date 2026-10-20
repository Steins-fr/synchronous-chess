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
    /** The search key of its name (search.helper): what a search reads */
    nameKey: string;
    /** Set for a private room: the hash of its password (password.helper) */
    passwordHash?: string;
    /** Whether the room has a password: what the list of the rooms reads, never the hash */
    isPrivate: boolean;
    players: Player[];
    queue: Player[];
    /**
     * SHA-256 of the token of each player who joined the room, by name, kept once it left: the host reconnects the room
     * with its own, the page of a player joins a private room again without its password (not once reloaded: its token
     * is new)
     */
    tokenHashes: Record<string, string>;
    /**
     * Set while the host is disconnected, in epoch seconds: the room waits until then for the host to reconnect, then
     * no longer exists. The creation of a room deletes it afterwards
     */
    expiresAt?: number;
    /**
     * In epoch seconds, while the host is connected: the room no longer exists after it, unless a ping of the host renews
     * it (RoomService.LEASE). A room whose host left without $disconnect ends then
     */
    leaseUntil: number;
}
