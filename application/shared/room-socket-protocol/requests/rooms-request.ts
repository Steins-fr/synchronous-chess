import { RoomGame } from '../room-game.enum';

/** The open rooms of a game */
export default interface RoomsRequest {
    game: RoomGame;
    /** Part of the name of the room or of its host, whatever the case: every room without */
    search?: string;
}
