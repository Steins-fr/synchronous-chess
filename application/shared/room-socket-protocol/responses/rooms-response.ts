/** A room a player can join: its host connected, and a place left */
export interface OpenRoom {
    roomName: string;
    hostPlayer: string;
    playerCount: number;
    maxPlayer: number;
    /** Joined with its password only */
    isPrivate: boolean;
}

export default interface RoomsResponse {
    /** By name */
    rooms: OpenRoom[];
}
