import { signal } from '@angular/core';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessage, HostRoomMessageType, RemoteSignalPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType, SignalPayload } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { isRtcSignal } from '@protocol/rtc-signal';
import { Subject } from 'rxjs';
import { Negotiator, NegotiatorConnectionState } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { LocalPlayer } from '../player/local-player';
import { Player } from '../player/player';
import { WebRtcPlayer } from '../player/web-rtc-player';
import { HostingContext } from './room-hosting';

/** What joining the room again through the socket gave */
export enum RejoinResult {
    /** Connecting to the host: the others connect to this participant through it, as to a joining player */
    JOINED = 'joined',
    /** The room waits for its host: this participant is the last one */
    HOST_LEFT = 'hostLeft',
    /** Not joined, to try again later: the API failed, or this participant hosts or connects already */
    NOT_JOINED = 'notJoined',
}

export abstract class RoomNetwork {
    private readonly _localPlayer: LocalPlayer;

    public get localPlayer(): LocalPlayer {
        return this._localPlayer;
    }

    protected players: Map<string, Player> = new Map<string, Player>();
    private readonly _negotiators = signal<ReadonlyMap<string, Readonly<Negotiator>>>(new Map());
    public readonly negotiators = this._negotiators.asReadonly();
    public abstract readonly initiator: boolean;
    public abstract readonly hostName: string;

    private readonly onMessageSubject = new Subject<ReceivedMessage>();
    public readonly onMessage$ = this.onMessageSubject.asObservable();
    private readonly playerAddedSubject = new Subject<Player>();
    public readonly playerAdded$ = this.playerAddedSubject.asObservable();
    private readonly playerRemovedSubject = new Subject<Player>();
    public readonly playerRemoved$ = this.playerRemovedSubject.asObservable();
    private readonly queueAddedSubject = new Subject<string>();
    public readonly queueAdded$ = this.queueAddedSubject.asObservable();
    private readonly queueRemovedSubject = new Subject<string>();
    public readonly queueRemoved$ = this.queueRemovedSubject.asObservable();
    protected readonly roomLostSubject = new Subject<void>();
    /** The room this participant hosts could not move to a new socket: nobody can join it anymore */
    public readonly roomLost$ = this.roomLostSubject.asObservable();

    protected constructor(
        protected readonly roomSocketApi: RoomSocketApi,
        public readonly roomName: string,
        localPlayerName: string,
    ) {
        this._localPlayer = new LocalPlayer(localPlayerName);
        this.players.set(this._localPlayer.name, this._localPlayer);
    }

    /**
     * The room agreed its host left: the participant named takes over, the others connect to the joining players
     * through it
     */
    public abstract changeHost(hostName: string): void;

    /** Joins the room again through the socket, having lost the connections to all the participants */
    public rejoin(): Promise<RejoinResult> {
        // The host does not join its room: the players connect to it again
        return Promise.resolve(RejoinResult.NOT_JOINED);
    }

    /**
     * Connects again to a participant still in the room, the connection to it lost, through a participant connected to
     * both: the relay forwards their signals
     */
    public restoreLink(playerName: string, relayName: string): void {
        const relay: Player | undefined = this.players.get(relayName);

        if (relay === undefined || this.isPlayerNameAlreadyInRoom(playerName)) {
            return;
        }

        const negotiator: WebrtcNegotiator = new WebrtcNegotiator(playerName, new Webrtc(), relay);
        this.addNegotiator(negotiator);
        void negotiator.initiate();
    }

    /** What the hosting of the room reads and changes of this network */
    protected hostingContext(maxPlayer: number, token: string): HostingContext {
        return {
            roomSocketApi: this.roomSocketApi,
            roomName: this.roomName,
            localPlayerName: this.localPlayer.name,
            maxPlayer,
            token,
            players: () => this.players,
            occupancy: () => this.players.size + this.getNegotiatorSize(),
            addNegotiator: (negotiator: Negotiator) => this.addNegotiator(negotiator),
            transmitMessage: (message: NetworkMessage) => this.transmitMessage(message),
        };
    }

    protected transmitMessage(message: NetworkMessage): void {
        this.players.forEach((player: Player) => {
            if (!player.isLocal) {
                player.sendData(message);
            }
        });
    }

    protected isPlayerNameAlreadyInRoom(playerName: string): boolean {
        return this.players.has(playerName) || this._negotiators().has(playerName);
    }

    // Remote player creation

    protected addNegotiator(negotiator: Negotiator): void {
        const replaced = this._negotiators().get(negotiator.playerName);
        this._negotiators.update(negotiators => new Map(negotiators).set(negotiator.playerName, negotiator));
        replaced?.clear();
        this.subscribeNegotiatorConnectionState(negotiator);
        this.queueAddedSubject.next(negotiator.playerName);
    }

    protected getNegotiator(playerName: string): Readonly<Negotiator> | undefined {
        return this._negotiators().get(playerName);
    }

    protected addPlayer(player: WebRtcPlayer): void {
        // A replaced player's disconnection is ignored, so it has to be cleared here
        const replaced = this.players.get(player.name);
        this.players.set(player.name, player);
        replaced?.clear();
        this.subscribeData(player);
        this.subscribeOnDisconnected(player);
        this.playerAddedSubject.next(player);
    }

    protected abstract onRoomMessage(message: ReceivedMessage): void;

    // Player events
    protected subscribeData(player: WebRtcPlayer): void {
        player.message$.subscribe((message: ReceivedMessage) => {
            this.onNegotiationMessage(message, player);
            this.onRoomMessage(message);
            this.onMessageSubject.next(message);
        });
    }

    /**
     * Every participant relays the signals two others exchange to connect to each other through it: the host for a
     * joining player, any participant for a connection lost
     */
    private onNegotiationMessage(message: ReceivedMessage, sender: Player): void {
        if (message.origin === MessageOriginType.NEGOTIATOR && message.type === NegotiatorMessageType.SIGNAL) {
            this.relaySignal(message.from, message.payload);
        } else if (message.origin === MessageOriginType.HOST_ROOM && message.type === HostRoomMessageType.REMOTE_SIGNAL) {
            void this.onRemoteSignal(sender, message.payload);
        }
    }

    private relaySignal(from: string, payload: SignalPayload): void {
        const player: Player | undefined = this.players.get(payload.to);

        if (!player) {
            return;
        }

        if (!isRtcSignal(payload.signal)) { // Do not relay what the other peer could not register
            console.error('Room: invalid signal not relayed', { from, ...payload });
            return;
        }

        const message: HostRoomMessage = {
            type: HostRoomMessageType.REMOTE_SIGNAL,
            payload: { from, signal: payload.signal },
            origin: MessageOriginType.HOST_ROOM,
        };

        player.sendData(message);
    }

    /** A signal another participant relayed: the connection to its sender is negotiated through the same relay */
    private async onRemoteSignal(relay: Player, payload: RemoteSignalPayload): Promise<void> {
        if (!isRtcSignal(payload.signal)) { // Before any negotiator restarts its connection for it
            console.error('Room: invalid remote signal', payload);
            return;
        }

        let negotiator: Readonly<Negotiator> | undefined = this.getNegotiator(payload.from);

        if (!negotiator) {
            const newNegotiator: WebrtcNegotiator = new WebrtcNegotiator(payload.from, new Webrtc(), relay);
            this.addNegotiator(newNegotiator);
            negotiator = newNegotiator;
        }

        await negotiator.negotiationMessage(payload);
        console.debug('Negotiation message sent');
    }

    private subscribeOnDisconnected(player: WebRtcPlayer): void {
        player.disconnected$.subscribe(() => {
            if (this.players.get(player.name) === player) {
                this.onPlayerDisconnected(player);
                this.removePlayer(player);
            }
        });
    }

    protected abstract onPlayerConnected(player: Player): void;
    protected abstract onPlayerDisconnected(player: Player): void;

    private removePlayer(player: Player): void {
        this.playerRemovedSubject.next(player);
        this.players.delete(player.name);
        player.clear();
    }

    // Negotiator events

    private subscribeNegotiatorConnectionState(negotiator: Negotiator): void {
        negotiator.connectionState$.subscribe((connectionState: NegotiatorConnectionState) => {
            switch (connectionState) {
                case NegotiatorConnectionState.CONNECTED:
                    this.onNegotiatorConnected(negotiator);
                    break;
                case NegotiatorConnectionState.DISCONNECTED:
                    this.removeNegotiator(negotiator);
                    break;
                default:
                    switchExhaustivenessGuard(connectionState);
            }
        });
    }

    private onNegotiatorConnected(negotiator: Negotiator): void {
        if (this._negotiators().get(negotiator.playerName) !== negotiator) {
            return;
        }

        const player = new WebRtcPlayer(negotiator.playerName, negotiator.webRTC);
        this.removeNegotiator(negotiator);
        this.addPlayer(player);
        this.onPlayerConnected(player);
    }

    // A replaced negotiator is no longer registered, its events must not remove its successor
    private removeNegotiator(negotiator: Negotiator): void {
        const playerName = negotiator.playerName;

        if (this._negotiators().get(playerName) === negotiator) {
            this.queueRemovedSubject.next(playerName);
            this._negotiators.update(negotiators => {
                const current = new Map(negotiators);
                current.delete(playerName);
                return current;
            });
            negotiator.clear();
        }
    }

    protected getNegotiatorSize(): number {
        return this._negotiators().size;
    }

    public clear(): void {
        this.players.forEach((player: Player) => {
            player.clear();
        });
        this._negotiators().forEach((negotiator: Readonly<Negotiator>) => {
            negotiator.clear();
        });
        this.onMessageSubject.complete();
        this.playerAddedSubject.complete();
        this.playerRemovedSubject.complete();
        this.queueAddedSubject.complete();
        this.queueRemovedSubject.complete();
        this.roomLostSubject.complete();
    }
}
