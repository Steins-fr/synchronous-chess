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
import { PeerRoomNetwork, RoomAccess } from './classes/room-network/peer-room-network';
import { JoinFailure, RoomNetwork } from './classes/room-network/room-network';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export default class RoomManagerService {
    private readonly roomSocketApi = inject(RoomSocketApi);
    private readonly notificationService = inject(NotificationService);
    private readonly destroyRef = inject(DestroyRef);

    /**
     * @param signal aborted once the page left: the join asked again for a while stops, rejecting with an AbortError, not
     * notified
     */
    public async buildBlockRoom<M extends object>(
        setup: RoomSetupInterface,
        maxPlayer: number,
        routing: NonEmptyBlockChainRouting<M>,
        signal?: AbortSignal,
    ): Promise<BlockRoom<M>> {
        try {
            const keys = await BlockRoom.createKeys(setup.playerName);
            // Proves to the API the player of this page: the host reconnects its room with it
            const token: string = CryptoHelper.randomHex(32);
            const access: RoomAccess = { game: setup.game, password: setup.password, token };
            let roomConnection: RoomNetwork;

            if (setup.type === 'create') {
                const response: RoomCreateResponse = await this.roomSocketApi.send(RoomApiRequestTypeEnum.CREATE, {
                    roomName: setup.roomName,
                    maxPlayer,
                    game: setup.game,
                    password: setup.password,
                    playerName: setup.playerName,
                    token,
                });

                if (response.playerName !== setup.playerName || response.roomName !== setup.roomName || response.maxPlayer !== maxPlayer) {
                    throw new Error('Room creation failed, mismatched parameters');
                }

                roomConnection = new PeerRoomNetwork(this.roomSocketApi, setup.roomName, setup.playerName, setup.playerName, maxPlayer, access);
            } else {
                const response: RoomJoinResponse = await this.join(setup, access, signal);

                roomConnection = new PeerRoomNetwork(this.roomSocketApi, setup.roomName, setup.playerName, response.playerName, maxPlayer, access);
            }

            // The participant taking the room over from a host which left hosts it too
            roomConnection.roomLost$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                this.notificationService.error('La salle a perdu sa connexion au serveur : plus personne ne peut la rejoindre.');
            });
            roomConnection.joiningAgain$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                this.notificationService.info('La connexion à l\'hôte de la salle a échoué, nouvelle tentative…');
            });
            roomConnection.joinDelayed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((error: string) => {
                this.notificationService.info(RoomManagerService.retryMessage(error));
            });
            // Before the page gives the room up
            roomConnection.joinFailed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((failure: JoinFailure) => {
                this.notificationService.error(failure === JoinFailure.ROOM_FULL ? 'La salle est pleine.' : 'La connexion à l\'hôte de la salle a échoué.');
            });

            return new BlockRoom<M>(
                this.roomSocketApi,
                roomConnection,
                keys,
                routing,
            );
        } catch (e) {
            if (!signal?.aborted) {
                this.notificationService.error(RoomManagerService.failureMessage(setup, e));
            }

            throw e;
        }
    }

    private join(setup: RoomSetupInterface, access: RoomAccess, signal: AbortSignal | undefined): Promise<RoomJoinResponse> {
        return joinRoom(this.roomSocketApi, { roomName: setup.roomName, playerName: setup.playerName, ...access }, {
            onRetry: (error: string) => this.notificationService.info(RoomManagerService.retryMessage(error)),
            signal,
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
            case RoomApiErrorMessage.WRONG_PASSWORD:
                // Listed as public before it became private, or joined through a link
                return setup.password === undefined
                    ? 'Cette salle est privée : rejoignez-la depuis la liste, avec son mot de passe.'
                    : 'Le mot de passe de la salle est incorrect.';
            case RoomApiErrorMessage.OTHER_GAME:
                return 'Cette salle est celle d\'un autre jeu.';
            case RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS:
                return 'Trop de mots de passe incorrects pour cette salle : réessayez dans une minute.';
            default:
                return 'La salle est pleine ou elle n\'existe plus.';
        }
    }
}
