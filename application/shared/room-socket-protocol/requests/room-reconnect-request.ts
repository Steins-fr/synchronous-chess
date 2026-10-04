/** Moves the room to the connection sending it: its host, proving it with the token it gave when creating the room */
export default interface RoomReconnectRequest {
    roomName: string;
    playerName: string;
    token: string;
}
