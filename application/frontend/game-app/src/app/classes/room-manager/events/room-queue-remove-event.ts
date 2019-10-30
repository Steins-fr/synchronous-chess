import RoomEvent, { RoomEventType } from './room-event';

export default class RoomQueueRemoveEvent extends RoomEvent {
    public constructor(public readonly payload: string) {
        super(RoomEventType.QUEUE_REMOVE);
    }
}
