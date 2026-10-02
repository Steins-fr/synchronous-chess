import { BlockChainMessage } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { BlockRoomParticipantMessage } from '@app/services/room-manager/classes/webrtc/messages/block-room-participant-message';
import { Player } from '../../../player/player';

export class Participant {
    /** From the oldest: a player who lost its stored key pair signs with a new one, its blocks signed before are still valid */
    private readonly keys: CryptoKey[];
    private hasCurrentKey: boolean = false;

    /**
     * @param previousKeys the keys of the previous connections of the player
     */
    public constructor(
        private readonly player: Player,
        previousKeys: ReadonlyArray<CryptoKey> = [],
    ) {
        this.keys = [...previousKeys];
    }

    public get knownKeys(): ReadonlyArray<CryptoKey> {
        return this.keys;
    }

    /** The key of the current connection of the player */
    public receiveKey(key: CryptoKey): void {
        this.keys.push(key);
        this.hasCurrentKey = true;
    }

    public isReady(): boolean {
        return this.hasCurrentKey || this.isLocal;
    }

    public sendMessage(message: BlockChainMessage | BlockRoomParticipantMessage): void {

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
