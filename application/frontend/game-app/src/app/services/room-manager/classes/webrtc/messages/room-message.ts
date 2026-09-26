import { Envelope } from './envelope';
import MessageOriginType from './message-origin.types';

/** Message delivered to the application through `Room.messenger()` */
export interface AppMessage<T extends string = string, P = unknown> {
    readonly from: string;
    readonly type: T;
    readonly payload: P;
}

/** Turns a `{ type: payload }` map into a discriminated union of app messages */
export type AppMessagesOf<M, K extends keyof M & string = keyof M & string> = { [T in K]: AppMessage<T, M[T]> }[K];

export type RoomServiceMessage = Envelope<MessageOriginType.ROOM_SERVICE, string, unknown>;
