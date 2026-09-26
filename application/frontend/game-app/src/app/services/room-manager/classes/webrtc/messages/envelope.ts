import MessageOriginType from './message-origin.types';

export interface TypedMessage<T extends string, P> {
    readonly type: T;
    readonly payload: P;
}

/** Turns a `{ type: payload }` map into a discriminated union of typed messages */
export type TypedMessagesOf<M, K extends keyof M & string = keyof M & string> = { [T in K]: TypedMessage<T, M[T]> }[K];

export interface Envelope<O extends MessageOriginType, T extends string, P> extends TypedMessage<T, P> {
    readonly origin: O;
}

/** Turns a `{ type: payload }` map into a discriminated union of envelopes */
export type EnvelopesOf<O extends MessageOriginType, M, K extends keyof M & string = keyof M & string> =
    TypedMessagesOf<M, K> & { readonly origin: O };

/** `from` is stamped by the receiving player with the peer name, senders never set it */
export type Received<T> = T & { readonly from: string };
