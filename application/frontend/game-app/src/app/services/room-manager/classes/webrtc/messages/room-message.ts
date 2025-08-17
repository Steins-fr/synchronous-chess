import { ToReworkMessage } from './to-rework-message';

export interface RoomMessage<T = string, U = unknown> extends ToReworkMessage<U> {
    type: T;
}
