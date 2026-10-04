/** Moves the room to the connection sending it: its host, proving it with the token the room creation gave it */
export default interface RoomReconnectRequest {
    roomName: string;
    hostToken: string;
}
