import { Message } from './message';
import MessageOriginType from './message-origin.types';

export interface ToReworkMessage<U = unknown> extends Message<U> {
    from: string;
    origin: MessageOriginType;
}
