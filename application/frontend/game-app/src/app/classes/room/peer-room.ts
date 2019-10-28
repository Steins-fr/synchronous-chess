import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { Negotiator } from '../negotiator/negotiator';

import { HostRoomMessage, HostRoomMessageType } from '../webrtc/messages/host-room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc } from '../webrtc/webrtc';

import { Player } from '../player/player';
import { Room } from './room';

import { SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import RoomJoinResponse from 'src/app/services/room-api/responses/room-join-response';
import SignalResponse from 'src/app/services/room-api/responses/signal-response';
import { RoomApiResponseType } from 'src/app/services/room-api/room-api.service';

interface NewPlayerPayload {
    playerName: string;
}

interface JoiningRoomPayload {
    playerName: string;
}

export class PeerRoom extends Room {
    public initiator: boolean = false;
    public hostPlayer?: Player;

    protected askRoomCreation(): Promise<RoomJoinResponse> {
        return this.roomApi.join(this.roomName, this.localPlayer.name);
    }

    protected onSocketMessage(payload: SocketPayload): void {
        // TODO: do another way
        if (payload.type === RoomApiResponseType.JOINING_ROOM) {
            const data: JoiningRoomPayload = JSON.parse(payload.data);
            const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, data.playerName, new Webrtc(), this.roomApi);
            this.addNegotiator(negotiator);
        }
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

        if (this.players.has(newPlayerPayload.playerName) || this.queue.has(newPlayerPayload.playerName)) {
            return;
        }
        const negotiator: Negotiator = new WebrtcNegotiator(this.roomName, newPlayerPayload.playerName, new Webrtc(), this.hostPlayer);
        negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    private onRemoteSignal(remoteSignalPayload: SignalResponse): void {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        let negotiator: Negotiator;
        if (this.queue.has(remoteSignalPayload.from) === false) { // Create new negotiator
            negotiator = new WebrtcNegotiator(this.roomName, remoteSignalPayload.from, new Webrtc(), this.hostPlayer);
            this.addNegotiator(negotiator);
        } else { // If exists, get the receiving negotiator.
            negotiator = this.queue.get(remoteSignalPayload.from);
        }

        negotiator.negotiationMessage(remoteSignalPayload);
    }
}
