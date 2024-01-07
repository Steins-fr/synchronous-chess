import { Injectable, NgZone } from '@angular/core';
import { RoomServiceMessage } from '@app/classes/webrtc/messages/room-service-message';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import RoomReadyEvent from '@app/classes/room-manager/events/room-ready-event';
import { RoomApiService } from '@app/services/room-api/room-api.service';
import { RoomService } from '@app/services/room/room.service';
import { Block } from './block-chain/block';
import RoomPlayerAddEvent from '@app/classes/room-manager/events/room-player-add-event';
import { BlockRoomServiceInterface } from './block-room.service.interface';
import { DistributedBlockChain, BlockChainMessageTypes } from './block-chain/distributed-block-chain';
import { BlockChainMessage } from '@app/classes/webrtc/messages/block-chain-message';

@Injectable({
    providedIn: 'root'
})
export class BlockRoomService<RoomServiceNotification extends RoomServiceMessage> extends RoomService<RoomServiceNotification> implements BlockRoomServiceInterface {

    private readonly blockChain: DistributedBlockChain = new DistributedBlockChain(this);

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
        console.log('notifyMessage', block);
        const roomServiceMessage: RoomServiceMessage = {
            ...block.data,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        // @ts-ignore
        // TODO: rework types
        this.publicMessenger$.next(roomServiceMessage as RoomServiceNotification);
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
