import { Message } from '../webrtc/messages/message';
import { ToReworkMessage } from '../webrtc/messages/to-rework-message';

export enum PlayerType {
    HOST, PEER
}

export enum PlayerEventType {
    DISCONNECTED = 'disconnected',
    MESSAGE = 'message'
}

export interface PlayerEvent<T extends Message = Message> {
    type: PlayerEventType;
    name: string; // Player name
    message: T;
}

export abstract class Player {

    protected readonly markIdGenerator: Generator = function* generator(name: string): Generator {
        let id: number = 0;
        while (true) {
            ++id;
            yield `${ name }-${ id }`;
        }
    }(this.name);

    protected constructor(public readonly name: string, public readonly type: PlayerType) {}

    public abstract clear(): void;

    public abstract sendData(message: ToReworkMessage): void;

    public abstract get isLocal(): boolean;
}
