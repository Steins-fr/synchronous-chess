import { RoomMessage } from './room-message';

export interface RoomServiceMessage<T = string, U = unknown> extends RoomMessage<U> {
    type: T;
}
