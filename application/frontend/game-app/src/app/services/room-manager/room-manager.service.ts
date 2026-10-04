import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { joinRoom } from '@app/services/room-api/join-room';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockRoom, NonEmptyBlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import RoomCreateResponse from '@protocol/responses/room-create-response';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { HostRoomNetwork } from './classes/room-network/host-room-network';
import { PeerRoomNetwork } from './classes/room-network/peer-room-network';
import { RoomNetwork } from './classes/room-network/room-network';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export default class RoomManagerService {
    private readonly roomSocketApi = inject(RoomSocketApi);
    private readonly notificationService = inject(NotificationService);
    private readonly destroyRef = inject(DestroyRef);

    public async buildBlockRoom<M extends object>(
        setup: RoomSetupInterface,
        maxPlayer: number,
        routing: NonEmptyBlockChainRouting<M>,
    ): Promise<BlockRoom<M>> {
        try {
            const keys = await BlockRoom.createKeys(setup.playerName);
            // Proves to the API the player of this page: the host reconnects its room with it
            const token: string = CryptoHelper.randomHex(32);
            let roomConnection: RoomNetwork;

            if (setup.type === 'create') {
                const response: RoomCreateResponse = await this.roomSocketApi.send(RoomApiRequestTypeEnum.CREATE, { roomName: setup.roomName, maxPlayer, playerName: setup.playerName, token });

                if (response.playerName !== setup.playerName || response.roomName !== setup.roomName || response.maxPlayer !== maxPlayer) {
                    throw new Error('Room creation failed, mismatched parameters');
                }

                roomConnection = new HostRoomNetwork(this.roomSocketApi, setup.roomName, maxPlayer, setup.playerName, token);
            } else {
                const response: RoomJoinResponse = await this.join(setup, token);

                roomConnection = new PeerRoomNetwork(this.roomSocketApi, setup.roomName, setup.playerName, response.playerName, maxPlayer, token);
            }

            // The participant taking the room over from a host which left hosts it too
            roomConnection.roomLost$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                this.notificationService.error('La salle a perdu sa connexion au serveur : plus personne ne peut la rejoindre.');
            });

            return new BlockRoom<M>(
                this.roomSocketApi,
                roomConnection,
                keys,
                routing,
            );
        } catch (e) {
            this.notificationService.error(RoomManagerService.failureMessage(setup, e));
            throw e;
        }
    }

    private join(setup: RoomSetupInterface, token: string): Promise<RoomJoinResponse> {
        return joinRoom(this.roomSocketApi, { roomName: setup.roomName, playerName: setup.playerName, token }, (error: string) => {
            this.notificationService.info(RoomManagerService.retryMessage(error));
        });
    }


    private static retryMessage(error: string): string {
        return error === RoomApiErrorMessage.HOST_DISCONNECTED ? 'L\'hôte de la salle se reconnecte…' : 'Ce nom est encore dans la salle, reconnexion en cours…';
    }

    private static failureMessage(setup: RoomSetupInterface, error: unknown): string {
        const message: string | undefined = error instanceof Error ? error.message : undefined;

        if (setup.type === 'create') {
            return message === RoomApiErrorMessage.ROOM_ALREADY_EXISTS ? 'La salle existe déjà.' : 'La salle n\'a pas pu être créée.';
        }

        switch (message) {
            case RoomApiErrorMessage.ALREADY_IN_GAME:
                return 'Un joueur de ce nom est déjà dans la salle.';
            case RoomApiErrorMessage.ALREADY_IN_QUEUE:
                return 'Un joueur de ce nom attend déjà d\'entrer dans la salle.';
            case RoomApiErrorMessage.HOST_DISCONNECTED:
                return 'L\'hôte de la salle s\'est déconnecté.';
            default:
                return 'La salle est pleine ou elle n\'existe plus.';
        }
    }
}
