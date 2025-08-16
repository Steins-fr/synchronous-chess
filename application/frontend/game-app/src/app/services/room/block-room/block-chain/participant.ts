import { Player } from '../../../../classes/player/player';
import { BlockChainMessage } from '../../../../classes/webrtc/messages/block-chain-message';

export class Participant {

    public publicKey?: CryptoKey;

    public constructor(
        private readonly player: Player
    ) {
    }

    public isReady(): boolean {
        return !!this.publicKey || this.isLocal();
    }

    public sendMessage(message: BlockChainMessage): void {

        if (this.isLocal()) {
            return;
        }

        this.player.sendData(message);
    }

    public get name(): string {
        return this.player.name;
    }

    public isLocal(): boolean {
        return this.player.isLocal();
    }
}
