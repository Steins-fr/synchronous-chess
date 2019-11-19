import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { Negotiator } from '../negotiator/negotiator';

import { HostRoomMessage, HostRoomMessageType } from '../webrtc/messages/host-room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc } from '../webrtc/webrtc';

import { Player, PlayerType } from '../player/player';
import { RoomManager } from './room-manager';

import RoomJoinResponse from 'src/app/services/room-api/responses/room-join-response';
import SignalResponse from 'src/app/services/room-api/responses/signal-response';

export interface NewPlayerPayload {
    playerName: string;
}

export class PeerRoomManager extends RoomManager {
    protected initiator: boolean = false;
    protected hostPlayer?: Player;

    public async join(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const response: RoomJoinResponse = await this.roomApi.join(roomName, playerName);
        this.setLocalPlayer(playerName, PlayerType.PEER);
        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, response.playerName, PlayerType.HOST, new Webrtc(), this.roomApi);
        this.addNegotiator(negotiator);
        return response;
    }

    protected onPlayerConnected(player: Player): void {
        if (this.hostPlayer === undefined) {
            this.hostPlayer = player;
        }
    }

    protected onPlayerDisconnected(player: Player): void {
        if (this.hostPlayer !== undefined && this.hostPlayer.name === player.name) {
            this.hostPlayer = undefined;
        }
    }

    protected onRoomMessage(roomMessage: HostRoomMessage<SignalResponse> | HostRoomMessage<NewPlayerPayload>): void {
        if (roomMessage.origin !== MessageOriginType.HOST_ROOM) {
            return;
        }

        // TODO: better casting, notifier ?
        switch (roomMessage.type) {
            case HostRoomMessageType.NEW_PLAYER:
                const newPlayerMessage: HostRoomMessage<NewPlayerPayload> = roomMessage as HostRoomMessage<NewPlayerPayload>;
                this.onNewPlayer(newPlayerMessage.payload);
                break;
            case HostRoomMessageType.REMOTE_SIGNAL:
                const remoteMessage: HostRoomMessage<SignalResponse> = roomMessage as HostRoomMessage<SignalResponse>;
                this.onRemoteSignal(remoteMessage.payload);
                break;
        }
    }

    private onNewPlayer(newPlayerPayload: NewPlayerPayload): void {
        if (this.localPlayer.name === newPlayerPayload.playerName) { // I am notified that I joined the room => close the socket
            this.roomApi.close();
        }

        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        if (this.players.has(newPlayerPayload.playerName) || this.negotiators.has(newPlayerPayload.playerName)) {
            return;
        }
        const negotiator: Negotiator = new WebrtcNegotiator(newPlayerPayload.playerName, PlayerType.PEER, new Webrtc(), this.hostPlayer);
        negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    private onRemoteSignal(remoteSignalPayload: SignalResponse): void {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        let negotiator: Negotiator;
        if (this.negotiators.has(remoteSignalPayload.from) === false) { // Create new negotiator
            negotiator = new WebrtcNegotiator(remoteSignalPayload.from, PlayerType.PEER, new Webrtc(), this.hostPlayer);
            this.addNegotiator(negotiator);
        } else { // If exists, get the receiving negotiator.
            negotiator = this.negotiators.get(remoteSignalPayload.from);
        }

        negotiator.negotiationMessage(remoteSignalPayload);
    }
}
