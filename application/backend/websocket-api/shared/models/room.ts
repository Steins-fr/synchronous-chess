import Player from './player';

export default interface Room {
    id: string;
    connectionId: string;
    hostPlayer: string;
    maxPlayer: number;
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
