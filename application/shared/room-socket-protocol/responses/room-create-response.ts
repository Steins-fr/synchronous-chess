export default interface RoomCreateResponse {
    playerName: string;
    roomName: string;
    maxPlayer: number;
    /** Given to the host only, which reconnects its room to another connection with it */
    hostToken: string;
}
