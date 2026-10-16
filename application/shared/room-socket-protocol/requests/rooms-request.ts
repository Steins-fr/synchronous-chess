import { RoomGame } from '../room-game.enum';

/** The open rooms of a game */
export default interface RoomsRequest {
    game: RoomGame;
    /** The start of the name of the room, whatever the case: the most recent rooms without */
    search?: string;
}
