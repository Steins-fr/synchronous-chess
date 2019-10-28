import { Message } from './message';
import MessageOriginType from './message-origin.types';

export interface RoomMessage extends Message {
    from?: string;
    origin: MessageOriginType;
}
