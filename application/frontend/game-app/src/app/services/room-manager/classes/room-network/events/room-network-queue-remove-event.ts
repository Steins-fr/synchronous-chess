import RoomNetworkEvent, { RoomNetworkEventType } from './room-network-event';

export default class RoomNetworkQueueRemoveEvent extends RoomNetworkEvent {
    public constructor(public readonly payload: string) {
        super(RoomNetworkEventType.QUEUE_REMOVE);
    }
}
