import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
    /**
     * A player reloading the page joins again under its name before the host noticed it left: the websocket API refuses
     * the name until the host removes the former connection, which takes a few seconds. Joins are refused as well while
     * the host reconnects its room to a new socket
     */
    private static readonly JOIN_RETRY_DELAY: number = 2000;
    private static readonly JOIN_RETRIES: number = 10;
    private static readonly RETRIED_ERRORS: ReadonlySet<string | undefined> = new Set([
        RoomApiErrorMessage.ALREADY_IN_GAME,
        RoomApiErrorMessage.ALREADY_IN_QUEUE,
        RoomApiErrorMessage.HOST_DISCONNECTED,
    ]);

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
            let roomConnection: RoomNetwork;

            if (setup.type === 'create') {
                const response: RoomCreateResponse = await this.roomSocketApi.send(RoomApiRequestTypeEnum.CREATE, { roomName: setup.roomName, maxPlayer, playerName: setup.playerName });

                if (response.playerName !== setup.playerName || response.roomName !== setup.roomName || response.maxPlayer !== maxPlayer) {
                    throw new Error('Room creation failed, mismatched parameters');
                }

                const hostRoomNetwork = new HostRoomNetwork(this.roomSocketApi, setup.roomName, maxPlayer, setup.playerName, response.hostToken);
                hostRoomNetwork.roomLost$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                    this.notificationService.error('La salle a perdu sa connexion au serveur : plus personne ne peut la rejoindre.');
                });
                roomConnection = hostRoomNetwork;
            } else {
                const response: RoomJoinResponse = await this.join(setup);

                roomConnection = new PeerRoomNetwork(this.roomSocketApi, setup.roomName, setup.playerName, response.playerName);
            }

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

    private async join(setup: RoomSetupInterface): Promise<RoomJoinResponse> {
        for (let retry = 0; ; retry++) {
            try {
                // eslint-disable-next-line no-await-in-loop -- retries, one attempt after the other
                return await this.roomSocketApi.send(RoomApiRequestTypeEnum.JOIN, { roomName: setup.roomName, playerName: setup.playerName });
            } catch (e) {
                const message: string | undefined = e instanceof Error ? e.message : undefined;

                if (!RoomManagerService.RETRIED_ERRORS.has(message) || retry === RoomManagerService.JOIN_RETRIES) {
                    throw e;
                }

                if (retry === 0) {
                    this.notificationService.info(RoomManagerService.retryMessage(message));
                }

                // eslint-disable-next-line no-await-in-loop -- the delay between two attempts
                await new Promise<void>((resolve) => setTimeout(resolve, RoomManagerService.JOIN_RETRY_DELAY));
            }
        }
    }


    private static retryMessage(error: string | undefined): string {
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
