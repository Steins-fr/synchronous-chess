/**
 * The paths of the routes of the HTTP API, each selected by its method and path (`GET /rooms`): what is not the
 * connectivity of a room, which the websocket API serves (RoomApiRoute)
 */
export enum RoomApiHttpRoute {
    /** GET: the open rooms of a game, a RoomsRequest in the query string, answered by a RoomsResponse */
    ROOMS = '/rooms',
}
