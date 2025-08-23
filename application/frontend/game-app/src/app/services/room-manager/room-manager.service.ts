import { inject, Injectable } from '@angular/core';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockRoom } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { HostRoomNetwork } from './classes/room-network/host-room-network';
import { PeerRoomNetwork } from './classes/room-network/peer-room-network';
import { RoomNetwork } from './classes/room-network/room-network';

@Injectable({
    providedIn: 'root'
})
export default class RoomManagerService {
    private readonly roomApiService = inject(RoomSocketApi);

    public async buildBlockRoom<RoomServiceNotification extends RoomMessage>(
        setup: RoomSetupInterface,
        maxPlayer: number,
    ): Promise<BlockRoom<RoomServiceNotification>> {
        try {
            const keyPair = await BlockRoom.createKeyPair();
            let roomConnection: RoomNetwork<RoomMessage>;

            if (setup.type === 'create') {
                roomConnection = await HostRoomNetwork.create<RoomMessage>(
                    this.roomApiService,
                    setup.roomName,
                    maxPlayer,
                    setup.playerName,
                );
            } else {
                roomConnection = await PeerRoomNetwork.create<RoomMessage>(
                    this.roomApiService,
                    setup.roomName,
                    setup.playerName,
                );
            }

            return new BlockRoom(
                this.roomApiService,
                roomConnection,
                keyPair,
            );
        } catch (e) {
            if (setup.type === 'create') {
                // TODO: snackbar
                console.error('La salle existe déjà');
            } else {
                console.error('La salle est pleine ou elle n\'existe plus.');
            }

            throw e;
        }
    }
}
