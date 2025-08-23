import { BlockChainMessage } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Block } from './block-chain/block';
import { BlockChainMessageTypes, DistributedBlockChain } from './block-chain/distributed-block-chain';
import { BlockRoomInterface } from './block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import RoomNetworkPlayerAddEvent from '../../room-network/events/room-network-player-add-event';
import { RoomNetwork } from '../../room-network/room-network';

export class BlockRoom<RoomServiceNotification extends RoomMessage> extends Room<RoomServiceNotification> implements BlockRoomInterface {

    private readonly blockChain: DistributedBlockChain;

    public static async createKeyPair(): Promise<CryptoKeyPair> {
        return await DistributedBlockChain.createKeyPair();
    }

    public constructor(
        roomApi: RoomSocketApi,
        roomConnection: RoomNetwork<RoomMessage>,
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

    public override transmitMessage<T>(type: string, message: T): void {
        // Do not await, there is no need to handle the result
        void this.blockChain.transmitMessage(type, message);
    }

    protected override onMessage(message: BlockChainMessage): void {
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

    protected override handleRoomPlayerAddEvent(event: RoomNetworkPlayerAddEvent): void {
        super.handleRoomPlayerAddEvent(event);

        this.blockChain.onNewPlayer(event.payload);
    }
}
