import { NgZone } from '@angular/core';
import RoomNetworkPlayerAddEvent from '@app/classes/room-network/events/room-network-player-add-event';
import { BlockChainMessage } from '@app/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Block } from './block-chain/block';
import { DistributedBlockChain, BlockChainMessageTypes } from './block-chain/distributed-block-chain';
import { BlockRoomInterface } from './block-room.interface';

export class BlockRoom<RoomServiceNotification extends RoomMessage> extends Room<RoomServiceNotification> implements BlockRoomInterface {

    private readonly blockChain: DistributedBlockChain = new DistributedBlockChain(this);

    public constructor(ngZone: NgZone, roomApi: RoomSocketApi) {
        super(ngZone, roomApi);
    }

    public override async transmitMessage<T>(type: string, message: T): Promise<void> {
        await this.blockChain.transmitMessage(type, message);
    }

    protected override onMessage(message: BlockChainMessage): void {
        if (message.origin !== MessageOriginType.BLOCK_ROOM_SERVICE) {
            return;
        }

        // TODO: rework types
        this.blockChain.onMessage(message as BlockChainMessageTypes);
    }

    public notifyMessage(block: Block): void {
        console.log('notifyMessage', block);
        const roomServiceMessage: RoomMessage = {
            ...block.data,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        // @ts-ignore
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
