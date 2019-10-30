import RoomEvent, { RoomEventType } from './room-event';

export default class RoomQueueAddEvent extends RoomEvent {
    public constructor(public readonly payload: string) {
        super(RoomEventType.QUEUE_ADD);
    }
}
