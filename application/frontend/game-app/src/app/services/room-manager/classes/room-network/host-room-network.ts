import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessage, HostRoomMessageType, RemoteSignalPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import JoinNotification from '@protocol/notifications/join-notification';
import { isRtcSignal } from '@protocol/rtc-signal';
import { RoomApiRequestTypeEnum, RoomSocketApiNotificationEnum } from '@protocol/socket-packet-payload.type';
import { Subject, takeUntil } from 'rxjs';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomNetwork } from './room-network';

export class HostRoomNetwork extends RoomNetwork {

    public readonly initiator: boolean = true;

    public get hostName(): string {
        return this.localPlayer.name;
    }

    private readonly refreshId: ReturnType<typeof setInterval>;
    private destroyRef = new Subject<void>();

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        private readonly maxPlayer: number,
        localPlayerName: string,
    ) {
        super(roomApi, roomName, localPlayerName);
        this.roomSocketApi.notification$.pipe(takeUntil(this.destroyRef)).subscribe((notification) => {
            if (notification.type === RoomSocketApiNotificationEnum.JOIN_REQUEST) {
                void this.onJoinNotification(notification.data);
            }
        });
        this.refreshId = this.enableMatchmakingStateRefresh();
    }

    private enableMatchmakingStateRefresh(): ReturnType<typeof setInterval> {
        const refreshInterval: number = 360_000; // 6 minutes
        return setInterval(async () => {
            try {
                const roomName: string = this.roomName;
                const serverPlayers: string[] = (await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName })).players;
                const localPlayers: ReadonlySet<string> = new Set(this.players.keys());
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
                    if (!localPlayers.has(playerName)) {
                        playersToRemove.push(playerName);
                    }
                }

                for (const playerName of missingPlayers) {
                    // eslint-disable-next-line no-await-in-loop -- one update of the room at a time on the API
                    await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName, playerName });
                }

                for (const playerName of playersToRemove) {
                    // eslint-disable-next-line no-await-in-loop -- the API removes a player by its index in the room: two removals at a time could remove the wrong one
                    await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName, playerName });
                }
            } catch (e) {
                console.error(e);
            }
        }, refreshInterval);
    }

    private async onJoinNotification(data: JoinNotification): Promise<void> {
        const nbPlayers: number = this.players.size + this.getNegotiatorSize();
        if (nbPlayers >= this.maxPlayer) {
            this.roomSocketApi
                .send(RoomApiRequestTypeEnum.FULL, { to: data.playerName, roomName: this.roomName })
                .catch((err: string) => console.error(err));
        } else {
            const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, data.playerName, new Webrtc(), this.roomSocketApi);
            await negotiator.initiate();
            this.addNegotiator(negotiator);
        }
    }

    protected transmitNewPlayer(playerName: string): void {
        const message: HostRoomMessage = {
            type: HostRoomMessageType.NEW_PLAYER,
            payload: { playerName },
            origin: MessageOriginType.HOST_ROOM,
        };

        this.transmitMessage(message);
    }

    protected onPlayerConnected(player: Player): void {
        void this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: this.roomName, playerName: player.name });
    }

    protected onPlayerDisconnected(player: Player): void {
        void this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: this.roomName, playerName: player.name });
    }

    protected onRoomMessage(message: ReceivedMessage): void {
        if (message.origin !== MessageOriginType.NEGOTIATOR) {
            console.warn('HostRoom: no message', message);
            return;
        }
        console.warn('HostRoom: onRoomMessage', message);

        if (message.type === NegotiatorMessageType.SIGNAL) {
            const player: Player | undefined = this.players.get(message.payload.to);

            if (!player) {
                return;
            }

            if (!isRtcSignal(message.payload.signal)) { // Do not relay what the other peer could not register
                console.error('HostRoom: invalid signal not relayed', message);
                return;
            }

            const remoteSignalPayload: RemoteSignalPayload = {
                from: message.from,
                signal: message.payload.signal
            };

            const negotiationMessage: HostRoomMessage = {
                type: HostRoomMessageType.REMOTE_SIGNAL,
                payload: remoteSignalPayload,
                origin: MessageOriginType.HOST_ROOM,
            };

            player.sendData(negotiationMessage);
        }
    }

    public override clear(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
        clearInterval(this.refreshId);
        super.clear();
    }
}
