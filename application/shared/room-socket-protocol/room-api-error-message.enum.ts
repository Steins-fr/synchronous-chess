/** The messages of the error responses the application tells apart, sent by the websocket API */
export enum RoomApiErrorMessage {
    /** Another player, of another token, holds the name in the room: the join is refused at once */
    ALREADY_IN_GAME = 'Already in game',
    /** Another player, of another token, waits to enter the room under the name: the join is refused at once */
    ALREADY_IN_QUEUE = 'Already in queue',
    /**
     * The former connection of the player, of the same token, is still in the room or its queue (a page reloaded, its
     * connections lost), until the host tells it left: the join is asked again
     */
    FORMER_CONNECTION = 'Former connection',
    /** The host lost its connection: the room waits for it to reconnect */
    HOST_DISCONNECTED = 'Host disconnected',
    /** A player can not take over the room while its host is connected: until its former connection closes */
    HOST_CONNECTED = 'Host connected',
    /** The password is not the one of the private room */
    WRONG_PASSWORD = 'Wrong password',
    /** The room joined is the one of another game than the page's */
    OTHER_GAME = 'Room of another game',
    /** Too many wrong passwords in a row: the private room refuses the passwords for a while */
    TOO_MANY_PASSWORD_ATTEMPTS = 'Too many password attempts',
    /** The host removed the player from the room: its name and its browser are refused as long as the room lasts */
    REMOVED = 'Removed',
}
