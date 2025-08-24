import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import { ToReworkMessage } from '@app/services/room-manager/classes/webrtc/messages/to-rework-message';

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

    protected constructor(public readonly name: string) {}

    public abstract clear(): void;

    public abstract sendData(message: ToReworkMessage): void;

    public abstract get isLocal(): boolean;
}
