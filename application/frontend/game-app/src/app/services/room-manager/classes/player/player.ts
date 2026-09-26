import { ToReworkMessage } from '@app/services/room-manager/classes/webrtc/messages/to-rework-message';

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
