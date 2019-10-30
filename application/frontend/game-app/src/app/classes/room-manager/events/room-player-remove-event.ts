import RoomEvent, { RoomEventType } from './room-event';
import { Player } from '../../player/player';

export default class RoomPlayerRemoveEvent extends RoomEvent {
    public constructor(public readonly payload: Player) {
        super(RoomEventType.PLAYER_REMOVE);
    }
}
