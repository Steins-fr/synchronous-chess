import RtcSignalResponse from '@app/services/room-api/responses/rtc-signal-response';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType, NewPlayerPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { Negotiator } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomNetwork } from './room-network';

export class PeerRoomNetwork extends RoomNetwork {
    public readonly initiator: boolean = false;
    protected hostPlayer?: Player;

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        hostPlayerName: string,
    ) {
        super(roomApi, roomName, localPlayerName);

        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, hostPlayerName, new Webrtc(), roomApi);
        this.addNegotiator(negotiator);
    }

    protected onPlayerConnected(player: Player): void {
        // console.log(`Set host player: ${player.name}`);
        // FIXME: improve host player assignment logic
        this.hostPlayer ??= player;
    }

    protected onPlayerDisconnected(player: Player): void {
        if (this.hostPlayer !== undefined && this.hostPlayer.name === player.name) {
            this.hostPlayer = undefined;
        }
    }

    protected onRoomMessage(message: ReceivedMessage): void {
        if (message.origin !== MessageOriginType.HOST_ROOM) {
            return;
        }

        switch (message.type) {
            case HostRoomMessageType.NEW_PLAYER:
                void this.onNewPlayer(message.payload);
                break;
            case HostRoomMessageType.REMOTE_SIGNAL:
                void this.onRemoteSignal(message.payload);
                break;
            default:
                switchExhaustivenessGuard(message);
        }
    }

    private async onNewPlayer(newPlayerPayload: NewPlayerPayload): Promise<void> {
        if (this.localPlayer.name === newPlayerPayload.playerName) { // I am notified that I joined the room => close the socket
            this.roomSocketApi.close();
        }

        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        if (this.isPlayerNameAlreadyInRoom(newPlayerPayload.playerName)) {
            return;
        }
        const negotiator: Negotiator = new WebrtcNegotiator(newPlayerPayload.playerName, new Webrtc(), this.hostPlayer);
        await negotiator.initiate();
        this.addNegotiator(negotiator);
    }

    private async onRemoteSignal(remoteSignalPayload: RtcSignalResponse): Promise<void> {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        let negotiator = this.getNegotiator(remoteSignalPayload.from);

        if (!negotiator) { // Create new negotiator
            const newNegotiator = new WebrtcNegotiator(remoteSignalPayload.from, new Webrtc(), this.hostPlayer);
            this.addNegotiator(newNegotiator);
            negotiator = newNegotiator;
        }

        await negotiator.negotiationMessage(remoteSignalPayload);
        console.debug('Negotiation message sent');
    }
}
