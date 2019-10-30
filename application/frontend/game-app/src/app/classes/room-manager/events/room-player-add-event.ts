import RoomEvent, { RoomEventType } from './room-event';
import { Player } from '../../player/player';

export default class RoomPlayerAddEvent extends RoomEvent {
    public constructor(public readonly payload: Player) {
        super(RoomEventType.PLAYER_ADD);
    }
}
