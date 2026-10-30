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
    /** Not joined, to try again later: the API failed, or this participant connects already */
    NOT_JOINED = 'notJoined',
    /** Nothing to join anymore: the API refused the join for good, the room expired, or the host its full room */
    ROOM_LOST = 'roomLost',
}

/** Why the player gave up joining the room: nobody connected it to the room, or the room removed it */
export enum JoinFailure {
    /** The host refused the player, its room full */
    ROOM_FULL = 'roomFull',
    /** The connection to the host failed, the player joining the room again too */
    HOST_UNREACHABLE = 'hostUnreachable',
    /** The room removed the player: refused joining it again as long as it lasts */
    REMOVED = 'removed',
}

export abstract class RoomNetwork {
    /**
     * How long the links to a removed player stay open: its page first receives the block removing it, and gives the
     * room up by itself. Webrtc.close drops the packets not acknowledged yet, sent again 3 times 1 second apart
     */
    private static readonly REMOVAL_GRACE_MS: number = 5000;

    private readonly _localPlayer: LocalPlayer;

    public get localPlayer(): LocalPlayer {
        return this._localPlayer;
    }

    protected players: Map<string, Player> = new Map<string, Player>();
    private readonly _negotiators = signal<ReadonlyMap<string, Readonly<Negotiator>>>(new Map());
    public readonly negotiators = this._negotiators.asReadonly();
    /** The players the room removed: never connected to again, nor let join the room through this participant */
    private readonly refused = new Set<string>();
    /** The links to the players removed, closing once their grace ends */
    private readonly removalTimers = new Set<ReturnType<typeof setTimeout>>();
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
    /** The room this participant hosts could not move to a new socket, or could not be joined again: nobody can join it anymore */
    public readonly roomLost$ = this.roomLostSubject.asObservable();
    protected readonly joiningAgainSubject = new Subject<void>();
    /** The connection to the host failed: the player joins the room again */
    public readonly joiningAgain$ = this.joiningAgainSubject.asObservable();
    protected readonly joinDelayedSubject = new Subject<string>();
    /** The API refuses the player joining the room again for a while, with this error: the player asks again later */
    public readonly joinDelayed$ = this.joinDelayedSubject.asObservable();
    protected readonly joinFailedSubject = new Subject<JoinFailure>();
    /**
     * The player gave up joining the room, never connected to it, or its place given to another player meanwhile: a
     * participant joining it again stays in it otherwise
     */
    public readonly joinFailed$ = this.joinFailedSubject.asObservable();

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

    /**
     * Joins the room again through the socket, having lost the connections to all the participants: the host lets them
     * take the room over first
     */
    public abstract rejoin(): Promise<RejoinResult>;

    /** The room agreed the participant left: its host removes it from the room on the API */
    public abstract removeFromRoom(playerName: string): void;

    /**
     * Connects again to a participant still in the room, the connection to it lost, through a participant connected to
     * both: the relay forwards their signals
     */
    public restoreLink(playerName: string, relayName: string): void {
        const relay: Player | undefined = this.players.get(relayName);

        if (relay === undefined || this.refused.has(playerName) || this.isPlayerNameAlreadyInRoom(playerName)) {
            return;
        }

        const negotiator: WebrtcNegotiator = new WebrtcNegotiator(playerName, new Webrtc(), relay);
        this.addNegotiator(negotiator);
        void negotiator.initiate();
    }

    /**
     * The room removed the player, every page alike, its history included: this participant never connects to it again,
     * nor lets it join the room. Connected, its link closes after REMOVAL_GRACE_MS as a lost connection's would: the room
     * agrees it left (departed$), and its host removes it from the API. The local player removed gives the room up
     * (joinFailed$)
     */
    public exclude(playerName: string): void {
        if (playerName === this.localPlayer.name) {
            // Not while the room delivers the block removing it: the page clears the room on it
            queueMicrotask(() => this.joinFailedSubject.next(JoinFailure.REMOVED));
            return;
        }

        if (this.refused.has(playerName)) {
            return;
        }

        this.refused.add(playerName);
        const negotiator: Readonly<Negotiator> | undefined = this._negotiators().get(playerName);

        if (negotiator !== undefined) {
            this.removeNegotiator(negotiator);
        }

        // A removal replayed, its player gone long ago, closes nothing
        if (this.players.has(playerName)) {
            const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
                this.removalTimers.delete(timer);
                this.disconnect(playerName);
            }, RoomNetwork.REMOVAL_GRACE_MS);
            this.removalTimers.add(timer);
        }
    }

    protected isRefused(playerName: string): boolean {
        return this.refused.has(playerName);
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
            occupancy: (playerName: string) => this.occupancy(playerName),
            refused: () => this.refused,
            addNegotiator: (negotiator: Negotiator) => this.addNegotiator(negotiator),
            transmitMessage: (message: NetworkMessage) => this.transmitMessage(message),
        };
    }

    /**
     * The places the room counts for a player joining it: the participants and the players negotiating, each name once,
     * the player itself left out. A participant joining again replaces its former connection, not counted yet as gone
     */
    private occupancy(playerName: string): number {
        const names: Set<string> = new Set<string>([...this.players.keys(), ...this._negotiators().keys()]);
        names.delete(playerName);
        return names.size;
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

        if (this.refused.has(payload.from)) { // Before any negotiator: the room removed its sender
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

    /**
     * Closes the link to the player as if lost, the departure path of the room: WebRtcPlayer.clear() alone emits nothing.
     * Gone already, nothing to close
     */
    private disconnect(playerName: string): void {
        const player: Player | undefined = this.players.get(playerName);

        if (player !== undefined) {
            this.onPlayerDisconnected(player);
            this.removePlayer(player);
        }
    }

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

        const player = new WebRtcPlayer(negotiator.playerName, negotiator.webRTC, negotiator.isInitiator);
        this.removeNegotiator(negotiator);
        this.addPlayer(player);
        this.onPlayerConnected(player);
    }

    // A replaced negotiator is no longer registered, its events must not remove its successor
    private removeNegotiator(negotiator: Readonly<Negotiator>): void {
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
        this.removalTimers.forEach((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
        this.removalTimers.clear();
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
        this.joiningAgainSubject.complete();
        this.joinDelayedSubject.complete();
        this.joinFailedSubject.complete();
    }
}
