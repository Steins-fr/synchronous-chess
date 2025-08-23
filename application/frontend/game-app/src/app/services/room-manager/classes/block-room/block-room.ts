import { BlockChainMessage } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Block } from './block-chain/block';
import { BlockChainMessageTypes, DistributedBlockChain } from './block-chain/distributed-block-chain';
import { BlockRoomInterface } from './block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import RoomNetworkPlayerAddEvent from '../room-network/events/room-network-player-add-event';

export class BlockRoom<RoomServiceNotification extends RoomMessage> extends Room<RoomServiceNotification> implements BlockRoomInterface {

    private readonly blockChain: DistributedBlockChain;

    public static async create<RoomServiceNotification extends RoomMessage>(roomApi: RoomSocketApi): Promise<BlockRoom<RoomServiceNotification>> {
        const keyPair = await DistributedBlockChain.createKeyPair();

        return new BlockRoom(roomApi, keyPair);
    }

    protected constructor(
        roomApi: RoomSocketApi,
        keyPair: CryptoKeyPair,
    ) {
        super(roomApi);
        this.blockChain = new DistributedBlockChain(this, keyPair);
    }

    public override transmitMessage<T>(type: string, message: T): void {
        void this.blockChain.transmitMessage(type, message);
    }

    protected override onMessage(message: BlockChainMessage): void {
        if (message.origin !== MessageOriginType.BLOCK_ROOM_SERVICE) {
            return;
        }

        // TODO: rework types
        this.blockChain.onMessage(message as BlockChainMessageTypes);
    }

    public notifyMessage(block: Block): void {
        const roomServiceMessage: RoomMessage = {
            ...block.data,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };
        TimedLogger.log(roomServiceMessage);

        // TODO: rework types
        this.publicMessenger$.next(roomServiceMessage as RoomServiceNotification);
    }

    protected override postSetupRoom(): void {
        this.blockChain.initiate();
        this.blockChain.onNewPlayer(this.localPlayer);

        super.postSetupRoom();
    }

    protected override handleRoomPlayerAddEvent(event: RoomNetworkPlayerAddEvent): void {
        super.handleRoomPlayerAddEvent(event);

        this.blockChain.onNewPlayer(event.payload);
    }

    public override clear(): void {
        this.blockChain.clear();
        super.clear();
    }
}
