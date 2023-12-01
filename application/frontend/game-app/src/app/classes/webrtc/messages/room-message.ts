import { Message } from './message';
import MessageOriginType from './message-origin.types';

export interface RoomMessage<U = unknown> extends Message<U> {
    from: string;
    origin: MessageOriginType;
}
