import RtcSignalResponse from '@app/services/room-api/responses/rtc-signal-response';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessage, HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { Negotiator } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player, PlayerType } from '../player/player';
import { RoomNetwork } from './room-network';

export interface NewPlayerPayload {
    playerName: string;
}

export class PeerRoomNetwork<MessageType extends Message> extends RoomNetwork<MessageType> {
    public readonly initiator: boolean = false;
    protected hostPlayer?: Player;

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        hostPlayerName: string,
    ) {
        super(roomApi, roomName, localPlayerName);

        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, hostPlayerName, PlayerType.HOST, new Webrtc(), roomApi);
        this.addNegotiator(negotiator);
    }

    protected onPlayerConnected(player: Player): void {
        // FIXME: improve host player assignment logic
        this.hostPlayer ??= player;
    }

    protected onPlayerDisconnected(player: Player): void {
        if (this.hostPlayer !== undefined && this.hostPlayer.name === player.name) {
            this.hostPlayer = undefined;
        }
    }

    protected onRoomMessage(roomMessage: HostRoomMessage<RtcSignalResponse> | HostRoomMessage<NewPlayerPayload>): void {
        if (roomMessage.origin !== MessageOriginType.HOST_ROOM) {
            return;
        }

        // FIXME: better casting, notifier ?
        switch (roomMessage.type) {
            case HostRoomMessageType.NEW_PLAYER:
                const newPlayerMessage: HostRoomMessage<NewPlayerPayload> = roomMessage as HostRoomMessage<NewPlayerPayload>;
                void this.onNewPlayer(newPlayerMessage.payload);
                break;
            case HostRoomMessageType.REMOTE_SIGNAL:
                const remoteMessage: HostRoomMessage<RtcSignalResponse> = roomMessage as HostRoomMessage<RtcSignalResponse>;
                void this.onRemoteSignal(remoteMessage.payload);
                break;
        }
    }

    private async onNewPlayer(newPlayerPayload: NewPlayerPayload): Promise<void> {
        if (this.localPlayer.name === newPlayerPayload.playerName) { // I am notified that I joined the room => close the socket
            this.roomSocketApi.close();
        }

        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        if (this.players.has(newPlayerPayload.playerName) || this.negotiators.has(newPlayerPayload.playerName)) {
            return;
        }
        const negotiator: Negotiator = new WebrtcNegotiator(newPlayerPayload.playerName, PlayerType.PEER, new Webrtc(), this.hostPlayer);
        await negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    private async onRemoteSignal(remoteSignalPayload: RtcSignalResponse): Promise<void> {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        let negotiator: Negotiator | undefined = this.negotiators.get(remoteSignalPayload.from);

        if (!negotiator) { // Create new negotiator
            negotiator = new WebrtcNegotiator(remoteSignalPayload.from, PlayerType.PEER, new Webrtc(), this.hostPlayer);
            this.addNegotiator(negotiator);
        }

        await negotiator.negotiationMessage(remoteSignalPayload);
        console.debug('Negotiation message sent');
    }
}
