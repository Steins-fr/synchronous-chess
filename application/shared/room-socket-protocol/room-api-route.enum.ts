/** The routes of the websocket API, selected by the `message` field of a message (`$request.body.message`) */
export enum RoomApiRoute {
    /** The requests, run by the sendmessage lambda */
    SEND_MESSAGE = 'sendmessage',
    /**
     * Keeps a connection open, answered by nothing: API Gateway closes a connection without message for 10 minutes. A
     * mock integration on AWS, no lambda runs
     */
    PING = 'ping',
}
