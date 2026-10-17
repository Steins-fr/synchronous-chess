import { RoomGame } from '../room-game.enum';

/** The open rooms of a game: the query string of GET /rooms of the HTTP API (RoomApiHttpRoute.ROOMS) */
export default interface RoomsRequest {
    game: RoomGame;
    /** A part of the name of the room, whatever the case, the names starting with it first: the most recent rooms without */
    search?: string;
}
