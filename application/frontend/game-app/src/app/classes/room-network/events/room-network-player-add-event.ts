import { Player } from '@app/classes/player/player';
import RoomNetworkEvent, { RoomNetworkEventType } from './room-network-event';

export default class RoomNetworkPlayerAddEvent extends RoomNetworkEvent {
    public constructor(public readonly payload: Player) {
        super(RoomNetworkEventType.PLAYER_ADD);
    }
}
