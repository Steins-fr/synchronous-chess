import { Envelope, Received, TypedMessage, TypedMessagesOf } from './envelope';
import MessageOriginType from './message-origin.types';

/** Message delivered to the application through `Room.messenger()` */
export type AppMessage<T extends string = string, P = unknown> = Received<TypedMessage<T, P>>;

/** Turns a `{ type: payload }` map into a discriminated union of app messages */
export type AppMessagesOf<M, K extends keyof M & string = keyof M & string> = Received<TypedMessagesOf<M, K>>;

export type RoomServiceMessage = Envelope<MessageOriginType.ROOM_SERVICE, string, unknown>;
