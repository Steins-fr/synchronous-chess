import { Negotiator } from '@app/classes/negotiator/negotiator';
import { WebrtcNegotiator } from '@app/classes/negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '@app/classes/negotiator/websocket-negotiator';
import { Player, PlayerType } from '@app/classes/player/player';
import { HostRoomMessage, HostRoomMessageType } from '@app/classes/webrtc/messages/host-room-message';
import { Message } from '@app/classes/webrtc/messages/message';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { Webrtc } from '@app/classes/webrtc/webrtc';
import { Zone } from '@app/interfaces/zone.interface';
import RoomJoinResponse from '@app/services/room-api/responses/room-join-response';
import RtcSignalResponse from '@app/services/room-api/responses/rtc-signal-response';
import { RoomSocketApi, RoomApiRequestTypeEnum } from '@app/services/room-api/room-socket.api';
import { RoomNetwork, OnMessageCallback } from './room-network';

export interface NewPlayerPayload {
    playerName: string;
}

export class PeerRoomNetwork<MessageType extends Message> extends RoomNetwork<MessageType> {
    public readonly initiator: boolean = false;
    protected hostPlayer?: Player;

    public static async create<MessageType extends Message>(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        onMessage: OnMessageCallback<MessageType>,
        zone?: Zone,
    ): Promise<PeerRoomNetwork<MessageType>> {
        const response: RoomJoinResponse = await roomApi.send(RoomApiRequestTypeEnum.JOIN, { roomName, playerName: localPlayerName });

        return new PeerRoomNetwork<MessageType>(roomApi, roomName, localPlayerName, response.playerName, onMessage, zone);
    }

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        hostPlayerName: string,
        onMessage: OnMessageCallback<MessageType>,
        zone?: Zone,
    ) {
        super(roomApi, roomName, localPlayerName, onMessage);

        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, hostPlayerName, PlayerType.HOST, new Webrtc(zone), roomApi);
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
                this.onNewPlayer(newPlayerMessage.payload);
                break;
            case HostRoomMessageType.REMOTE_SIGNAL:
                const remoteMessage: HostRoomMessage<RtcSignalResponse> = roomMessage as HostRoomMessage<RtcSignalResponse>;
                this.onRemoteSignal(remoteMessage.payload);
                break;
        }
    }

    private onNewPlayer(newPlayerPayload: NewPlayerPayload): void {
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
        negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    private onRemoteSignal(remoteSignalPayload: RtcSignalResponse): void {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        let negotiator: Negotiator | undefined = this.negotiators.get(remoteSignalPayload.from);

        if (!negotiator) { // Create new negotiator
            negotiator = new WebrtcNegotiator(remoteSignalPayload.from, PlayerType.PEER, new Webrtc(), this.hostPlayer);
            this.addNegotiator(negotiator);
        }

        negotiator.negotiationMessage(remoteSignalPayload).then(() => console.debug('Negotiation message sent'));
    }
}
