import { Message } from './message';
import MessageOriginType from './message-origin.types';

export interface RoomMessage<U = any> extends Message<U> {
    from?: string;
    origin: MessageOriginType;
}
