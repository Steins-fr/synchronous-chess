import { HostRoomMessage, HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessage, NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { ToReworkMessage } from '@app/services/room-manager/classes/webrtc/messages/to-rework-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import JoinNotification from '@app/services/room-api/notifications/join-notification';
import RoomCreateResponse from '@app/services/room-api/responses/room-create-response';
import RtcSignalResponse from '@app/services/room-api/responses/rtc-signal-response';
import {
    RoomSocketApi,
    RoomSocketApiNotificationEnum,
    RoomApiRequestTypeEnum
} from '@app/services/room-api/room-socket.api';
import { Subject, takeUntil } from 'rxjs';
import { NewPlayerPayload } from './peer-room-network';
import { RoomNetwork } from './room-network';
import { SignalPayload } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { PlayerType, Player } from '../player/player';

export class HostRoomNetwork<MessageType extends Message> extends RoomNetwork<MessageType> {

    public readonly initiator: boolean = true;
    private refreshId?: ReturnType<typeof setInterval>;
    private destroyRef = new Subject<void>();

    public static async create<MessageType extends Message>(
        roomApi: RoomSocketApi,
        roomName: string,
        maxPlayer: number,
        localPlayerName: string,
    ): Promise<HostRoomNetwork<MessageType>> {
        const response: RoomCreateResponse = await roomApi.send(RoomApiRequestTypeEnum.CREATE, { roomName, maxPlayer, playerName: localPlayerName });

        if (response.playerName !== localPlayerName || response.roomName !== roomName || response.maxPlayer !== maxPlayer) {
            throw new Error('Room creation failed, mismatched parameters');
        }

        const roomManager = new HostRoomNetwork<MessageType>(roomApi, roomName, maxPlayer, localPlayerName);

        try {
            roomManager.enableMatchmakingStateRefresh();
        } catch (e) {
            roomManager.clear();
            throw e;
        }

        return roomManager;
    }

    protected constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        private readonly maxPlayer: number,
        localPlayerName: string,
    ) {
        super(roomApi, roomName, localPlayerName);
        this.roomSocketApi.notification$.pipe(takeUntil(this.destroyRef)).subscribe((notification) => {
            if (notification.type === RoomSocketApiNotificationEnum.JOIN_REQUEST) {
                this.onJoinNotification(notification.data);
            }
        });
    }

    private enableMatchmakingStateRefresh(): void {
        const refreshInterval: number = 360000; // 6 minutes
        this.refreshId = setInterval(async () => {
            try {
                const roomName: string = this.roomName;
                const serverPlayers: string[] = (await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName })).players;
                const localPlayers: string[] = Array.from(this.players.keys());
                const missingPlayers: string[] = [];
                const playersToRemove: string[] = [];

                // Check if the server has less players than the local
                for (const player of this.players.values()) {
                    if (!serverPlayers.includes(player.name)) {
                        missingPlayers.push(player.name);
                    }
                }

                // Check if the server has more players than the local
                for (const playerName of serverPlayers) {
                    if (!localPlayers.includes(playerName)) {
                        playersToRemove.push(playerName);
                    }
                }

                for (const playerName of missingPlayers) {
                    await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName, playerName });
                }

                for (const playerName of playersToRemove) {
                    await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName, playerName });
                }
            } catch (e) {
                console.error(e);
            }
        }, refreshInterval);
    }

    private onJoinNotification(data: JoinNotification): void {
        const nbPlayers: number = this.players.size + this.negotiators.size;
        if (nbPlayers >= this.maxPlayer) {
            this.roomSocketApi
                .send(RoomApiRequestTypeEnum.FULL, { to: data.playerName, roomName: this.roomName })
                .catch((err: string) => console.error(err));
        } else {
            const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, data.playerName, PlayerType.PEER, new Webrtc(), this.roomSocketApi);
            negotiator.initiate();
            this.addNegotiator(negotiator);
        }
    }

    protected transmitNewPlayer(playerName: string): void {
        const message: HostRoomMessage<NewPlayerPayload> = {
            type: HostRoomMessageType.NEW_PLAYER,
            payload: { playerName },
            origin: MessageOriginType.HOST_ROOM,
            from: this.localPlayer.name
        };

        this.transmitMessage(message);
    }

    protected onPlayerConnected(player: Player): void {
        // FIXME: code
        this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: this.roomName, playerName: player.name }).then(() => {
            this.transmitNewPlayer(player.name);
        }).catch((err: string) => {
            console.error(err);
        });
    }

    protected onPlayerDisconnected(player: Player): void {
        // FIXME: code
        this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: this.roomName, playerName: player.name }).then().catch((err: string) => {
            console.error(err);
        });
    }

    protected onRoomMessage(roomMessage: ToReworkMessage<SignalPayload>, fromPlayer: string): void {
        if (roomMessage.origin !== MessageOriginType.NEGOTIATOR) {
            console.warn('HostRoom: no message', roomMessage);
            return;
        }
        console.warn('HostRoom: onRoomMessage', roomMessage);

        // TODO: Better casting, notifier ?
        const negotiatorMessage: NegotiatorMessage<SignalPayload> = roomMessage as NegotiatorMessage<SignalPayload>;

        if (negotiatorMessage.type === NegotiatorMessageType.SIGNAL) {
            const signalPayload: SignalPayload = negotiatorMessage.payload;
            const player: Player | undefined = this.players.get(signalPayload.to);

            if (!player) {
                return;
            }

            const remoteSignalPayload: RtcSignalResponse = {
                from: fromPlayer,
                signal: signalPayload.signal
            };

            const negotiationMessage: HostRoomMessage<RtcSignalResponse> = {
                type: HostRoomMessageType.REMOTE_SIGNAL,
                payload: remoteSignalPayload,
                origin: MessageOriginType.HOST_ROOM,
                from: this.localPlayer.name
            };

            player.sendData(negotiationMessage);
        }
    }

    public override clear(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
        if (this.refreshId !== undefined) {
            clearInterval(this.refreshId);
        }
        super.clear();
    }
}
