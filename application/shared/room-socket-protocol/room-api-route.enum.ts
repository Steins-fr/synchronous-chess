/** The routes of the websocket API, selected by the `message` field of a message (`$request.body.message`) */
export enum RoomApiRoute {
    /** The requests, run by the sendmessage lambda */
    SEND_MESSAGE = 'sendmessage',
    /**
     * Keeps a connection open, API Gateway closing a connection without message for 10 minutes, and the database awake
     * during a game: the ping lambda renews the lease of the room the connection hosts, a statement. Answered by nothing
     */
    PING = 'ping',
}
