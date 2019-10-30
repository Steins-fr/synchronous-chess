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

import { Room } from './room';
import { Player } from '../player/player';


export class HostRoom extends Room {

    public initiator: boolean = true;

    public constructor(roomApi: RoomApiService) {
        super(roomApi);
        this.roomApi.followNotification(RoomApiNotificationType.JOIN_REQUEST, this, (data: JoinNotification) => this.onJoinNotification(data));
    }

    protected askRoomCreation(): Promise<RoomCreateResponse> {
        return this.roomApi.create(this.roomName, 6, this.localPlayer.name);
    }

    private onJoinNotification(data: JoinNotification): void {
        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, data.playerName, new Webrtc(), this.roomApi);
        negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    protected transmitNewPlayer(playerName: string): void {
        this.players.forEach((player: Player) => {
            const message: HostRoomMessage = {
                type: HostRoomMessageType.NEW_PLAYER,
                payload: JSON.stringify({
                    playerName
                }),
                origin: MessageOriginType.HOST_ROOM,
                from: this.localPlayer.name
            };
            player.sendData(message);
        });
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

    protected onRoomMessage(roomMessage: RoomMessage, fromPlayer: string): void {
        if (roomMessage.origin !== MessageOriginType.NEGOTIATOR) {
            return;
        }
        const negotiatorMessage: NegotiatorMessage = roomMessage as NegotiatorMessage;

        if (negotiatorMessage.type === NegotiatorMessageType.SIGNAL) {
            const signalPayload: SignalPayload = JSON.parse(negotiatorMessage.payload);
            if (this.players.has(signalPayload.to) === false) {
                return;
            }

            const player: Player = this.players.get(signalPayload.to);
            const remoteSignalPayload: SignalResponse = {
                from: fromPlayer,
                signal: signalPayload.signal
            };

            const negotiationMessage: HostRoomMessage = {
                type: HostRoomMessageType.REMOTE_SIGNAL,
                payload: JSON.stringify(remoteSignalPayload),
                origin: MessageOriginType.HOST_ROOM,
                from: this.localPlayer.name
            };

            player.sendData(negotiationMessage);
        }
    }

    public clear(): void {
        this.roomApi.unfollowNotification(RoomApiNotificationType.JOIN_REQUEST, this);
        super.clear();
    }
}
