import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Block } from './block-chain/block';
import { DistributedBlockChain } from './block-chain/distributed-block-chain';
import { BlockRoomInterface } from './block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { Player } from '../../player/player';
import { RoomNetwork } from '../../room-network/room-network';

export class BlockRoom<M extends object> extends Room<M> implements BlockRoomInterface {

    private readonly blockChain: DistributedBlockChain;

    public static async createKeyPair(): Promise<CryptoKeyPair> {
        return await DistributedBlockChain.createKeyPair();
    }

    public constructor(
        roomApi: RoomSocketApi,
        roomConnection: RoomNetwork,
        keyPair: CryptoKeyPair,
    ) {
        super(roomApi, roomConnection);
        this.blockChain = new DistributedBlockChain(this, keyPair);
        this.blockChain.initiate();
        this.blockChain.onNewPlayer(this.localPlayer);
    }

    public override clear(): void {
        super.clear();
        this.blockChain.clear();
    }

    public override transmitMessage<K extends keyof M & string>(type: K, payload: M[K]): void {
        // Do not await, there is no need to handle the result
        void this.blockChain.transmitMessage(type, payload);
    }

    protected override onMessage(message: ReceivedMessage): void {
        this.blockChain.onMessage(message);
    }

    public notifyMessage(block: Block): void {
        TimedLogger.log(block.data);

        this.publicMessenger$.next(block.data);
    }

    protected override handleRoomPlayerAdd(player: Player): void {
        super.handleRoomPlayerAdd(player);

        this.blockChain.onNewPlayer(player);
    }
}
