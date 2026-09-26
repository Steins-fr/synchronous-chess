import MessageOriginType from './message-origin.types';

export interface Envelope<O extends MessageOriginType, T extends string, P> {
    readonly origin: O;
    readonly type: T;
    readonly payload: P;
}

/** Turns a `{ type: payload }` map into a discriminated union of envelopes */
export type EnvelopesOf<O extends MessageOriginType, M, K extends keyof M & string = keyof M & string> =
    { [T in K]: Envelope<O, T, M[T]> }[K];

/** `from` is stamped by the receiving player with the peer name, senders never set it */
export type Received<T> = T & { readonly from: string };
