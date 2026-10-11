import { RoomGame } from '../room-game.enum';

/** The open rooms of a game */
export default interface RoomsRequest {
    game: RoomGame;
}
