import { Injectable, NgZone } from '@angular/core';
import { RoomService } from '../room.service';
import { RoomServiceMessage } from '../../../classes/webrtc/messages/room-service-message';
import MessageOriginType from '../../../classes/webrtc/messages/message-origin.types';
import RoomReadyEvent from '../../../classes/room-manager/events/room-ready-event';
import { Block } from './block-chain/block';
import { RoomApiService } from '../../room-api/room-api.service';
import RoomPlayerAddEvent from '../../../classes/room-manager/events/room-player-add-event';
import { BlockRoomServiceInterface } from './block-room.service.interface';
import { DistributedBlockChain, BlockChainMessageTypes } from './block-chain/distributed-block-chain';
import { BlockChainMessage } from '../../../classes/webrtc/messages/block-chain-message';

@Injectable({
    providedIn: 'root'
})
export class BlockRoomService<RoomServiceNotification extends RoomServiceMessage> extends RoomService<RoomServiceNotification> implements BlockRoomServiceInterface {

    private blockChain: DistributedBlockChain = new DistributedBlockChain(this);

    public constructor(ngZone: NgZone, roomApi: RoomApiService) {
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
        const roomServiceMessage: RoomServiceMessage = {
            ...block.data,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        // @ts-ignore
        this._notifier.notify(roomServiceMessage.type, roomServiceMessage);
    }

    protected override handleRoomManagerReadyEvent(event: RoomReadyEvent): void {
        this.blockChain.initiate();
        super.handleRoomManagerReadyEvent(event);
    }

    protected override handleRoomPlayerAddEvent(event: RoomPlayerAddEvent): void {
        super.handleRoomPlayerAddEvent(event);

        this.blockChain.onNewPlayer(event.payload);
    }

    public override clear(): void {
        this.blockChain.clear();
        super.clear();
    }
}
