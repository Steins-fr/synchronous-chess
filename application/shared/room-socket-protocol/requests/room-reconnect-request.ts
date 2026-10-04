/**
 * Moves the room to the connection sending it, proven with the token the player gave when creating or joining it: its
 * host, or a player of the room taking over while the room waits for its host
 */
export default interface RoomReconnectRequest {
    roomName: string;
    playerName: string;
    token: string;
}
