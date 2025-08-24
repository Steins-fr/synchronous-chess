import { Player } from './player';

export class LocalPlayer extends Player {

    public constructor(name: string) {
        super(name);
    }

    public override clear(): void {
        // Do nothing
    }

    public override sendData(): void {
        throw new Error('Local player cannot send data');
    }

    public override get isLocal(): boolean {
        return true;
    }
}
