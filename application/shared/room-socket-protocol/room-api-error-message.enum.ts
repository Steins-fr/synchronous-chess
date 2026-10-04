/** The messages of the error responses the application tells apart, sent by the websocket API */
export enum RoomApiErrorMessage {
    ROOM_ALREADY_EXISTS = 'Room already exists',
    /** A player of the same name is in the room, until the host tells it left */
    ALREADY_IN_GAME = 'Already in game',
    ALREADY_IN_QUEUE = 'Already in queue',
    /** The host lost its connection: the room waits for it to reconnect */
    HOST_DISCONNECTED = 'Host disconnected',
}
