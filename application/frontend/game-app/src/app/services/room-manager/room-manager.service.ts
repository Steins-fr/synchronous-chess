import { inject, Injectable } from '@angular/core';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockRoom } from '@app/services/room-manager/classes/block-room/block-room';
import { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';

@Injectable({
    providedIn: 'root'
})
export default class RoomManagerService {
    private readonly roomApiService = inject(RoomSocketApi);

    public async buildBlockRoom<RoomServiceNotification extends RoomMessage>(
        setup: RoomSetupInterface,
        maxPlayer: number,
    ): Promise<BlockRoom<RoomServiceNotification>> {
        const room = await BlockRoom.create<RoomServiceNotification>(this.roomApiService);

        try {
            if (setup.type === 'create') {
                await room.createRoom(setup.roomName, setup.playerName, maxPlayer);
            } else {
                await room.joinRoom(setup.roomName, setup.playerName);
            }
        } catch (e) {
            if (setup.type === 'create') {
                // TODO: snackbar
                console.error('La salle existe déjà');
            } else {
                console.error('La salle est pleine ou elle n\'existe plus.');
            }

            throw e;
        }

        return room;
    }
}
