import RoomEvent, { RoomEventType } from './room-event';
import { RoomManager } from '../room-manager';

export default class RoomReadyEvent extends RoomEvent {
    public constructor(public readonly payload: RoomManager) {
        super(RoomEventType.READY);
    }
}
