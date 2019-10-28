import { RoomMessage } from './room-message';

export interface RoomServiceMessage<T> extends RoomMessage {
    type: T;
}
