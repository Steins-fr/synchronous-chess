import RoomNetworkEvent, { RoomNetworkEventType } from './room-network-event';

export default class RoomNetworkQueueAddEvent extends RoomNetworkEvent {
    public constructor(public readonly payload: string) {
        super(RoomNetworkEventType.QUEUE_ADD);
    }
}
