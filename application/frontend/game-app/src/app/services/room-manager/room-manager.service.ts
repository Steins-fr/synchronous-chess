import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { joinRoom } from '@app/services/room-api/join-room';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockRoom, NonEmptyBlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import RoomCreateResponse from '@protocol/responses/room-create-response';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { ROOM_TAG_DIGITS, ROOM_TAG_SEPARATOR } from '@protocol/room-limits';
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

                if (response.playerName !== setup.playerName || !RoomManagerService.isRoomId(response.roomName, setup.roomName) || response.maxPlayer !== maxPlayer) {
                    throw new Error('Room creation failed, mismatched parameters');
                }

                roomConnection = new PeerRoomNetwork(this.roomSocketApi, response.roomName, setup.playerName, setup.playerName, maxPlayer, access);
            } else {
                const response: RoomJoinResponse = await this.join(setup, access, signal);
                // The page left while the join was sent: no negotiation with the host
                signal?.throwIfAborted();

                roomConnection = new PeerRoomNetwork(this.roomSocketApi, setup.roomName, setup.playerName, response.playerName, maxPlayer, access);
            }

            // The participant taking the room over from a host which left hosts it too
            roomConnection.roomLost$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                this.notificationService.error({ key: marker('rooms.notifications.roomLost') });
            });
            roomConnection.joiningAgain$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                this.notificationService.info({ key: marker('rooms.notifications.joiningAgain') });
            });
            roomConnection.joinDelayed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((error: string) => {
                this.notificationService.info(RoomManagerService.retryMessage(error));
            });
            // Before the page gives the room up
            roomConnection.joinFailed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((failure: JoinFailure) => {
                this.notificationService.error({
                    key: failure === JoinFailure.ROOM_FULL ? marker('rooms.notifications.roomFull') : marker('rooms.notifications.hostUnreachable'),
                });
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

    private static retryMessage(error: string): TranslatableText {
        return {
            key: error === RoomApiErrorMessage.HOST_DISCONNECTED
                ? marker('rooms.notifications.hostReconnecting')
                : marker('rooms.notifications.nameStillInRoom'),
        };
    }

    /** The id of the room of the name: the name trimmed, the separator, then the digits of the tag the API drew */
    private static isRoomId(roomId: string, roomName: string): boolean {
        const prefix: string = `${ roomName.trim() }${ ROOM_TAG_SEPARATOR }`;
        const tag: string = roomId.slice(prefix.length);
        return roomId.startsWith(prefix) && tag.length === ROOM_TAG_DIGITS && /^\d+$/.test(tag);
    }

    private static failureMessage(setup: RoomSetupInterface, error: unknown): TranslatableText {
        return { key: RoomManagerService.failureKey(setup, error) };
    }

    private static failureKey(setup: RoomSetupInterface, error: unknown): string {
        const message: string | undefined = error instanceof Error ? error.message : undefined;

        if (setup.type === 'create') {
            return marker('rooms.errors.notCreated');
        }

        switch (message) {
            case RoomApiErrorMessage.ALREADY_IN_GAME:
                return marker('rooms.errors.nameInRoom');
            case RoomApiErrorMessage.ALREADY_IN_QUEUE:
                return marker('rooms.errors.nameWaiting');
            case RoomApiErrorMessage.HOST_DISCONNECTED:
                return marker('rooms.errors.hostDisconnected');
            case RoomApiErrorMessage.WRONG_PASSWORD:
                // Listed as public before it became private, or joined through a link
                return setup.password === undefined ? marker('rooms.errors.private') : marker('rooms.errors.wrongPassword');
            case RoomApiErrorMessage.OTHER_GAME:
                return marker('rooms.errors.otherGame');
            case RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS:
                return marker('rooms.errors.tooManyPasswords');
            default:
                return marker('rooms.errors.fullOrGone');
        }
    }
}
