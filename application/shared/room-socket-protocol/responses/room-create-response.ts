export default interface RoomCreateResponse {
    playerName: string;
    /** The id of the room created: its name and the tag the API drew (`friday#451203`) */
    roomName: string;
    maxPlayer: number;
}
