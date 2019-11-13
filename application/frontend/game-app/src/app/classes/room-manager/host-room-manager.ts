import RoomCreateResponse from 'src/app/services/room-api/responses/room-create-response';
import SignalResponse from 'src/app/services/room-api/responses/signal-response';
import { RoomApiService, RoomApiNotificationType } from 'src/app/services/room-api/room-api.service';
import JoinNotification from 'src/app/services/room-api/notifications/join-notification';

import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { SignalPayload } from '../negotiator/webrtc-negotiator';

import { HostRoomMessage, HostRoomMessageType } from '../webrtc/messages/host-room-message';
import { NegotiatorMessage, NegotiatorMessageType } from '../webrtc/messages/negotiator-message';
import { RoomMessage } from '../webrtc/messages/room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc } from '../webrtc/webrtc';

import { RoomManager } from './room-manager';
import { Player } from '../player/player';
import { NewPlayerPayload } from './peer-room-manager';


export class HostRoomManager extends RoomManager {

    protected initiator: boolean = true;
    private roomName?: string;
    private maxPlayer?: number;
    private refreshId?: NodeJS.Timer;

    public constructor(roomApi: RoomApiService) {
        super(roomApi);
        this.roomApi.notifier.follow(RoomApiNotificationType.JOIN_REQUEST, this, (data: JoinNotification) => this.onJoinNotification(data));
    }

    public async create(roomName: string, playerName: string, maxPlayer: number): Promise<RoomCreateResponse> {
        const response: RoomCreateResponse = await this.roomApi.create(roomName, maxPlayer, playerName);
        this.roomName = roomName;
        this.maxPlayer = maxPlayer;
        this.setLocalPlayer(playerName);
        this.enableRefresh();
        return response;
    }

    private enableRefresh(): void {
        this.refreshId = setInterval(async () => {
            try {
                let serverPlayers: Array<string> = (await this.roomApi.allPlayers(this.roomName)).players;
                for (const player of this.players.values()) {
                    const beforeLength: number = serverPlayers.length;
                    serverPlayers = serverPlayers.filter((playerName: string) => playerName !== player.name);
                    if (serverPlayers.length === beforeLength) { // The server is missing one player
                        await this.roomApi.addPlayer(this.roomName, player.name);
                    }
                }

                if (serverPlayers.length > 0) { // The server has more players than the local
                    for (const playerName of serverPlayers) {
                        await this.roomApi.removePlayer(this.roomName, playerName);
                    }
                }

            } catch (e) {
                console.error(e);
            }
        }, 360000); // 360000 => 6 minutes
    }

    private onJoinNotification(data: JoinNotification): void {
        const nbPlayers: number = this.players.size + this.negotiators.size;
        if (nbPlayers >= this.maxPlayer) {
            this.roomApi.full(data.playerName, this.roomName).catch((err: string) => console.error(err));
        } else {
            const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, data.playerName, new Webrtc(), this.roomApi);
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
        this.roomApi.addPlayer(this.roomName, player.name).then(() => {
            this.transmitNewPlayer(player.name);
        }).catch((err: string) => {
            console.error(err);
        });
    }
    protected onPlayerDisconnected(player: Player): void {
        this.roomApi.removePlayer(this.roomName, player.name).then().catch((err: string) => {
            console.error(err);
        });
    }

    protected onRoomMessage(roomMessage: RoomMessage<SignalPayload>, fromPlayer: string): void {
        if (roomMessage.origin !== MessageOriginType.NEGOTIATOR) {
            return;
        }

        // TODO: Better casting, notifier ?
        const negotiatorMessage: NegotiatorMessage<SignalPayload> = roomMessage as NegotiatorMessage<SignalPayload>;

        if (negotiatorMessage.type === NegotiatorMessageType.SIGNAL) {
            const signalPayload: SignalPayload = negotiatorMessage.payload;
            if (this.players.has(signalPayload.to) === false) {
                return;
            }

            const player: Player = this.players.get(signalPayload.to);
            const remoteSignalPayload: SignalResponse = {
                from: fromPlayer,
                signal: signalPayload.signal
            };

            const negotiationMessage: HostRoomMessage<SignalResponse> = {
                type: HostRoomMessageType.REMOTE_SIGNAL,
                payload: remoteSignalPayload,
                origin: MessageOriginType.HOST_ROOM,
                from: this.localPlayer.name
            };

            player.sendData(negotiationMessage);
        }
    }

    public clear(): void {
        this.roomApi.notifier.unfollow(RoomApiNotificationType.JOIN_REQUEST, this);
        if (this.refreshId !== undefined) {
            clearInterval(this.refreshId);
        }
        super.clear();
    }
}
