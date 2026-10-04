import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType, NewPlayerPayload, RemoteSignalPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { isRtcSignal } from '@protocol/rtc-signal';
import { Negotiator } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomHosting } from './room-hosting';
import { RoomNetwork } from './room-network';

/** The network of a player joining the room, which takes it over when the room agrees its host left and elects it */
export class PeerRoomNetwork extends RoomNetwork {
    protected hostPlayer?: Player;
    private _hostName: string;
    private hosting?: RoomHosting;

    public get initiator(): boolean {
        return this.hosting !== undefined;
    }

    public get hostName(): string {
        return this._hostName;
    }

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        hostName: string,
        private readonly maxPlayer: number,
        /** The token the player joined the room with, to take it over */
        private readonly token: string,
    ) {
        super(roomApi, roomName, localPlayerName);
        this._hostName = hostName;

        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, hostName, new Webrtc(), roomApi);
        this.addNegotiator(negotiator);
    }

    /** Takes the room over when elected, connects to the joining players through the new host otherwise */
    public changeHost(hostName: string): void {
        if (this.hosting) { // Hosting already: the room only changes its host once this one leaves
            return;
        }

        this._hostName = hostName;

        if (hostName === this.localPlayer.name) {
            this.hostPlayer = undefined;
            this.hosting = new RoomHosting(this.hostingContext(this.maxPlayer, this.token));
            this.hosting.roomLost$.subscribe(() => this.roomLostSubject.next());
        } else {
            this.hostPlayer = this.players.get(hostName);
        }
    }

    protected onPlayerConnected(player: Player): void {
        if (player.name === this.hostName) {
            this.hostPlayer = player;
        }

        this.hosting?.onPlayerConnected(player);
    }

    protected onPlayerDisconnected(player: Player): void {
        if (this.hostPlayer?.name === player.name) {
            this.hostPlayer = undefined;
        }

        this.hosting?.onPlayerDisconnected(player);
    }

    protected onRoomMessage(message: ReceivedMessage): void {
        this.hosting?.onRoomMessage(message);

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

    private async onRemoteSignal(remoteSignalPayload: RemoteSignalPayload): Promise<void> {
        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        if (!isRtcSignal(remoteSignalPayload.signal)) { // Before any negotiator restarts its connection for it
            console.error('PeerRoom: invalid remote signal', remoteSignalPayload);
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

    public override clear(): void {
        this.hosting?.clear();
        super.clear();
    }
}
