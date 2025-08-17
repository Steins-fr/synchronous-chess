import { BlockChainMessage } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { Player } from '../../player/player';

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
        return !!this._publicKey || this.isLocal;
    }

    public sendMessage(message: BlockChainMessage): void {

        if (this.isLocal) {
            return;
        }

        this.player.sendData(message);
    }

    public get name(): string {
        return this.player.name;
    }

    public get isLocal(): boolean {
        return this.player.isLocal;
    }
}
