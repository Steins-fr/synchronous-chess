import { signal } from '@angular/core';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Subject } from 'rxjs';
import { Negotiator, NegotiatorConnectionState } from '../negotiator/negotiator';
import { LocalPlayer } from '../player/local-player';
import { Player } from '../player/player';
import { WebRtcPlayer } from '../player/web-rtc-player';

export abstract class RoomNetwork {
    private readonly _localPlayer: LocalPlayer;

    public get localPlayer(): LocalPlayer {
        return this._localPlayer;
    }

    protected players: Map<string, Player> = new Map<string, Player>();
    private readonly _negotiators = signal<ReadonlyMap<string, Readonly<Negotiator>>>(new Map());
    public readonly negotiators = this._negotiators.asReadonly();
    public abstract readonly initiator: boolean;

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

    protected constructor(
        protected readonly roomSocketApi: RoomSocketApi,
        public readonly roomName: string,
        localPlayerName: string,
    ) {
        this._localPlayer = new LocalPlayer(localPlayerName);
        this.players.set(this._localPlayer.name, this._localPlayer);
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
        this._negotiators.update(negotiators => new Map(negotiators).set(negotiator.playerName, negotiator));
        this.subscribeNegotiatorConnectionState(negotiator);
        this.queueAddedSubject.next(negotiator.playerName);
    }

    protected getNegotiator(playerName: string): Readonly<Negotiator> | undefined {
        return this._negotiators().get(playerName);
    }

    protected addPlayer(player: WebRtcPlayer): void {
        this.players.set(player.name, player);
        this.subscribeData(player);
        this.subscribeOnDisconnected(player);
        this.playerAddedSubject.next(player);
    }

    protected abstract onRoomMessage(message: ReceivedMessage): void;

    // Player events
    protected subscribeData(player: WebRtcPlayer): void {
        player.message$.subscribe((message: ReceivedMessage) => {
            this.onRoomMessage(message);
            this.onMessageSubject.next(message);
        });
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
        if (this.players.has(player.name)) {
            this.playerRemovedSubject.next(player);
            this.players.delete(player.name);
            player.clear();
        }
    }

    // Negotiator events

    private subscribeNegotiatorConnectionState(negotiator: Negotiator): void {
        negotiator.connectionState$.subscribe((connectionState: NegotiatorConnectionState) => {
            switch (connectionState) {
                case NegotiatorConnectionState.CONNECTED:
                    this.onNegotiatorConnected(negotiator);
                    break;
                case NegotiatorConnectionState.DISCONNECTED:
                    this.removeNegotiator(negotiator.playerName);
                    break;
            }
        });
    }

    private onNegotiatorConnected(negotiator: Negotiator): void {
        if (this._negotiators().get(negotiator.playerName) !== negotiator) {
            return;
        }

        const player = new WebRtcPlayer(negotiator.playerName, negotiator.webRTC);
        this.removeNegotiator(negotiator.playerName);
        this.addPlayer(player);
        this.onPlayerConnected(player);
    }

    private removeNegotiator(playerName: string): void {
        const negotiator = this._negotiators().get(playerName);

        if (negotiator) {
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
    }
}
