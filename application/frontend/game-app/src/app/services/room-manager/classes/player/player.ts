import { idGenerator } from '@app/helpers/id-generator.helper';
import { NetworkMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';

function* markIdGenerator(name: string): Generator<string, never> {
    const ids: Generator<number, never> = idGenerator();
    while (true) {
        yield `${ name }-${ ids.next().value }`;
    }
}

export abstract class Player {

    protected readonly markIdGenerator: Generator<string, never> = markIdGenerator(this.name);

    protected constructor(public readonly name: string) {}

    public abstract clear(): void;

    public abstract sendData(message: NetworkMessage): void;

    public abstract get isLocal(): boolean;
}
