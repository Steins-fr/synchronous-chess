import { Player } from '@app/classes/player/player';
import { BlockChainMessage } from '@app/classes/webrtc/messages/block-chain-message';

export class Participant {
    public get publicKey(): CryptoKey {
        if (!this._publicKey) {
            throw new Error('Public key not set, please call isReady() first');
        }

        return this._publicKey;
    }

    public set publicKey(value: CryptoKey) {
        this._publicKey = value;
    }

    private _publicKey?: CryptoKey;

    public constructor(
        private readonly player: Player
    ) {
    }

    public isReady(): boolean {
        return !!this._publicKey || this.isLocal();
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
