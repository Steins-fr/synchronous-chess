import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { Negotiator } from '../negotiator/negotiator';

import { HostRoomMessage, HostRoomMessageType } from '../webrtc/messages/host-room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc } from '../webrtc/webrtc';

import { Player } from '../player/player';
import { RoomManager } from './room-manager';

import RoomJoinResponse from 'src/app/services/room-api/responses/room-join-response';
import SignalResponse from 'src/app/services/room-api/responses/signal-response';

interface NewPlayerPayload {
    playerName: string;
}

export class PeerRoomManager extends RoomManager {
    protected initiator: boolean = false;
    protected hostPlayer?: Player;

    public async join(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const response: RoomJoinResponse = await this.roomApi.join(roomName, playerName);
        this.setLocalPlayer(playerName);
        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, response.playerName, new Webrtc(), this.roomApi);
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

    protected onRoomMessage(roomMessage: HostRoomMessage): void {
        if (roomMessage.origin !== MessageOriginType.HOST_ROOM) {
            return;
        }

        switch (roomMessage.type) {
            case HostRoomMessageType.NEW_PLAYER:
                this.onNewPlayer(JSON.parse(roomMessage.payload));
                break;
            case HostRoomMessageType.REMOTE_SIGNAL:
                this.onRemoteSignal(JSON.parse(roomMessage.payload));
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
        const negotiator: Negotiator = new WebrtcNegotiator(newPlayerPayload.playerName, new Webrtc(), this.hostPlayer);
        negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    private onRemoteSignal(remoteSignalPayload: SignalResponse): void {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        let negotiator: Negotiator;
        if (this.negotiators.has(remoteSignalPayload.from) === false) { // Create new negotiator
            negotiator = new WebrtcNegotiator(remoteSignalPayload.from, new Webrtc(), this.hostPlayer);
            this.addNegotiator(negotiator);
        } else { // If exists, get the receiving negotiator.
            negotiator = this.negotiators.get(remoteSignalPayload.from);
        }

        negotiator.negotiationMessage(remoteSignalPayload);
    }
}
