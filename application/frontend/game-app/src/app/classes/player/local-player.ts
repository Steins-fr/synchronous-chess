import { Player, PlayerType } from '@app/classes/player/player';

export class LocalPlayer extends Player {

    public constructor(name: string) {
        super(name, PlayerType.HOST);
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
