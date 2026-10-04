import { isTemporaryJoinError, joinRoom } from '@app/services/room-api/join-room';
import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType, NewPlayerPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { Negotiator } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomHosting } from './room-hosting';
import { RejoinResult, RoomNetwork } from './room-network';

/**
 * The network of a participant of the room. The player creating the room hosts it, the others join it through the
 * host; the room agreeing its host left, the participant it elects takes it over
 */
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

    /**
     * @param hostName the name of the local player when it created the room
     * @param token the token the player created or joined the room with, to reconnect it or take it over
     */
    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        hostName: string,
        private readonly maxPlayer: number,
        private readonly token: string,
    ) {
        super(roomApi, roomName, localPlayerName);
        this._hostName = hostName;

        if (hostName === localPlayerName) { // The socket created the room
            this.startHosting(true);
        } else {
            this.addNegotiator(new WebsocketNegotiator(roomName, hostName, new Webrtc(), roomApi));
        }
    }

    private startHosting(holdsRoom: boolean): void {
        this.hostPlayer = undefined;
        this.hosting = new RoomHosting(this.hostingContext(this.maxPlayer, this.token), holdsRoom);
        this.hosting.roomLost$.subscribe(() => this.roomLostSubject.next());
    }

    /** Takes the room over when elected, connects to the joining players through the new host otherwise */
    public changeHost(hostName: string): void {
        if (this.hosting) { // Hosting already: the room only changes its host once this one leaves
            return;
        }

        this._hostName = hostName;

        if (hostName === this.localPlayer.name) {
            this.startHosting(false);
        } else {
            this.hostPlayer = this.players.get(hostName);
        }
    }

    public removeFromRoom(playerName: string): void {
        this.hosting?.removePlayer(playerName);
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
    }

    /** The signals relayed to this participant are negotiated by every network */
    protected onRoomMessage(message: ReceivedMessage): void {
        if (message.origin === MessageOriginType.HOST_ROOM && message.type === HostRoomMessageType.NEW_PLAYER) {
            void this.onNewPlayer(message.payload);
        }
    }

    /**
     * Joins the room again through the socket, as on a reloaded page: the API refuses the name until the host removed
     * the former connection, and while the host reconnects. The others connect to it again once connected to the host.
     * The host first closes the socket of its room: the participants it lost, still connected to each other, take the
     * room over, and the room waits for its host when they all left
     */
    public override async rejoin(): Promise<RejoinResult> {
        if (this.getNegotiatorSize() > 0) { // Connecting again already
            return RejoinResult.NOT_JOINED;
        }

        if (this.hosting) {
            this.hosting.clear();
            this.hosting = undefined;
            this.roomSocketApi.close();
        }

        try {
            const response: RoomJoinResponse = await joinRoom(this.roomSocketApi, { roomName: this.roomName, playerName: this.localPlayer.name, token: this.token });
            this._hostName = response.playerName;
            this.addNegotiator(new WebsocketNegotiator(this.roomName, response.playerName, new Webrtc(), this.roomSocketApi));
            return RejoinResult.JOINED;
        } catch (e) {
            return this.rejoinFailure(e);
        }
    }

    private rejoinFailure(error: unknown): RejoinResult {
        if (error instanceof RoomApiError && error.message === RoomApiErrorMessage.HOST_DISCONNECTED) {
            return RejoinResult.HOST_LEFT;
        }

        console.error('PeerRoom: the room could not be joined again', error);

        if (error instanceof RoomApiError && !isTemporaryJoinError(error)) { // The room expired
            this.roomLostSubject.next();
            return RejoinResult.ROOM_LOST;
        }

        return RejoinResult.NOT_JOINED;
    }

    private async onNewPlayer(newPlayerPayload: NewPlayerPayload): Promise<void> {
        // I am notified that I joined the room => close the socket, unless it holds the room I host
        if (this.localPlayer.name === newPlayerPayload.playerName && !this.hosting) {
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

    public override clear(): void {
        this.hosting?.clear();
        super.clear();
    }
}
