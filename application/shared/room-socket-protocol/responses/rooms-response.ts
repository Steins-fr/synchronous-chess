/** A room of the list: a player joins it, or joins it again once the room has a place for it or its host is back */
export interface OpenRoom {
    roomName: string;
    hostPlayer: string;
    playerCount: number;
    maxPlayer: number;
    /** Joined with its password only */
    isPrivate: boolean;
    /** False while the room waits for its host to reconnect: a join is refused until then */
    hostConnected: boolean;
}

export default interface RoomsResponse {
    /** The most recent first, or the best match of the search first: a limited count */
    rooms: OpenRoom[];
    /** More rooms exist, or match the search, than the ones listed */
    hasMore: boolean;
}
