import { Player } from '../../player/player';
import RoomNetworkEvent, { RoomNetworkEventType } from './room-network-event';

export default class RoomNetworkPlayerRemoveEvent extends RoomNetworkEvent {
    public constructor(public readonly payload: Player) {
        super(RoomNetworkEventType.PLAYER_REMOVE);
    }
}
