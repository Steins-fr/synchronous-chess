import { inject, Injectable } from '@angular/core';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomApiRequestTypeEnum, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockRoom } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { HostRoomNetwork } from './classes/room-network/host-room-network';
import { PeerRoomNetwork } from './classes/room-network/peer-room-network';
import { RoomNetwork } from './classes/room-network/room-network';
import RoomJoinResponse from '../room-api/responses/room-join-response';
import RoomCreateResponse from '../room-api/responses/room-create-response';
import { NotificationService } from '../notification/notification.service';

// FIXME: remove root provider
@Injectable({
    providedIn: 'root'
})
export default class RoomManagerService {
    private readonly roomSocketApi = inject(RoomSocketApi);
    private readonly notificationService = inject(NotificationService);

    public async buildBlockRoom<RoomServiceNotification extends RoomMessage>(
        setup: RoomSetupInterface,
        maxPlayer: number,
    ): Promise<BlockRoom<RoomServiceNotification>> {
        try {
            const keyPair = await BlockRoom.createKeyPair();
            let roomConnection: RoomNetwork<RoomMessage>;

            if (setup.type === 'create') {
                const response: RoomCreateResponse = await this.roomSocketApi.send(RoomApiRequestTypeEnum.CREATE, { roomName: setup.roomName, maxPlayer, playerName: setup.playerName });

                if (response.playerName !== setup.playerName || response.roomName !== setup.roomName || response.maxPlayer !== maxPlayer) {
                    throw new Error('Room creation failed, mismatched parameters');
                }

                roomConnection = new HostRoomNetwork<RoomMessage>(this.roomSocketApi, setup.roomName, maxPlayer, setup.playerName);
            } else {
                const response: RoomJoinResponse = await this.roomSocketApi.send(RoomApiRequestTypeEnum.JOIN, { roomName: setup.roomName, playerName: setup.playerName });

                roomConnection = new PeerRoomNetwork<RoomMessage>(this.roomSocketApi, setup.roomName, setup.playerName, response.playerName);
            }

            return new BlockRoom(
                this.roomSocketApi,
                roomConnection,
                keyPair,
            );
        } catch (e) {
            if (setup.type === 'create') {
                this.notificationService.error('La salle existe déjà');
            } else {
                this.notificationService.error('La salle est pleine ou elle n\'existe plus.');
            }

            throw e;
        }
    }
}
