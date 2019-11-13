import { RoomMessage } from './room-message';

export interface RoomServiceMessage<T = any, U = any> extends RoomMessage<U> {
    type: T;
}
