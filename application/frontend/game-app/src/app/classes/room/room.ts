import { NgZone } from '@angular/core';
import { WebSocketService, SocketPayload, SocketState } from '../../services/web-socket/web-socket.service';
import {
    Player,
    PlayerType,
    PlayerEventType,
    PlayerEvent,
    PlayerMessageType,
    PlayerMessage
} from 'src/app/classes/player/player';
import { Subscription, Subject, AsyncSubject } from 'rxjs';

export abstract class Room {
    protected socketSubs: Array<Subscription> = [];
    protected playersSubs: Map<string, Array<Subscription>> = new Map<string, Array<Subscription>>();
    protected socketService?: WebSocketService;

    public localPlayer?: Player;
    public players: Map<string, Player> = new Map<string, Player>();
    public initiator: boolean;
    public isSetup: boolean = false;
    public roomName: string = '';
    public socketState: SocketState = SocketState.CONNECTING;

    protected _onMessage: Subject<PlayerMessage>;

    public constructor() { }

    public setup(socketService: WebSocketService, onMessage: Subject<PlayerMessage>): void {
        this.clear();
        this._onMessage = onMessage;
        this.socketService = socketService;
        this.socketSubs.push(this.socketService.state.subscribe((state: SocketState) => {
            this.socketState = state;
        }));

        this.socketSubs.push(this.socketService.message.subscribe((payload: SocketPayload) => this.socketMessage(payload)));
        this.isSetup = true;
    }

    private socketMessage(payload: SocketPayload): void {
        if (payload.type === 'error') {
            console.error('Socket error', payload.data);
        } else {
            this.onSocketMessage(payload);
        }
    }

    protected abstract onSocketMessage(payload: SocketPayload): void;

    public transmitMessage(type: PlayerMessageType, message: string): void {
        this.players.forEach((player: Player) => {
            player.sendData({
                type,
                payload: message,
                isPrivate: false,
                from: this.localPlayer.name
            });
        });
    }

    // Room creation

    public create(roomName: string, playerName: string): Promise<void> {
        if (this.socketState === SocketState.OPEN) {
            this.roomName = roomName;
            this.localPlayer = new Player(this.roomName, playerName, PlayerType.LOCAL);
            this.players.set(this.localPlayer.name, this.localPlayer);
            return this.askRoomCreation();
        } else {
            return Promise.reject();
        }
    }

    protected abstract askRoomCreation(): Promise<void>;

    // Remote player creation

    protected newPlayer(playerName: string, playerType: PlayerType): Player {
        return new Player(this.roomName, playerName, playerType);
    }

    protected addPlayer(player: Player): void {
        this.players.set(player.name, player);
        this.subscribeData(player);
        this.subscribeOnConnected(player);
        this.subscribeOnDisconnected(player);
    }

    private pushSubscriptionForPlayer(playerName: string, sub: Subscription): void {
        let subs: Array<Subscription> = [];
        if (this.playersSubs.has(playerName)) {
            subs = this.playersSubs.get(playerName);
        }
        subs.push(sub);
        this.playersSubs.set(playerName, subs);
    }

    protected abstract onPeerPrivateMessage(playerMessage: PlayerMessage, fromPlayer: string): void;

    // Player events

    protected subscribeData(player: Player): void {
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent<PlayerMessage>) => {
            if (playerEvent.type !== PlayerEventType.MESSAGE) {
                return;
            }
            const playerMessage: PlayerMessage = playerEvent.payload;
            if (playerMessage.isPrivate) {
                this.onPeerPrivateMessage(playerMessage, playerEvent.name);
            } else {
                this._onMessage.next(playerMessage);
            }
        });
        this.pushSubscriptionForPlayer(player.name, sub);
    }

    private subscribeOnConnected(player: Player): void {
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent<void>) => {
            if (playerEvent.type === PlayerEventType.CONNECTED) {
                this.onPlayerConnected(playerEvent.name);
                sub.unsubscribe();
            }
        });
        this.pushSubscriptionForPlayer(player.name, sub); // To unsubscribe without receiving the event
    }

    protected abstract onPlayerConnected(playerName: string): void;

    private subscribeOnDisconnected(player: Player): void {
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent<void>) => {
            if (playerEvent.type === PlayerEventType.DISCONNECTED) {
                this.onPlayerDisconnected(playerEvent.name);
                if (this.players.has(playerEvent.name)) {
                    this.players.delete(playerEvent.name);
                }
                sub.unsubscribe();
            }
        });
        this.pushSubscriptionForPlayer(player.name, sub); // To unsubscribe without receiving the event
    }

    protected abstract onPlayerDisconnected(playerName: string): void;

    // Cleaning

    private clearPlayerSubscriptions(playerName: string): void {
        if (this.playersSubs.has(playerName)) {
            const subs: Array<Subscription> = this.playersSubs.get(playerName);
            subs.forEach((sub: Subscription) => {
                if (sub.closed === false) {
                    sub.unsubscribe();
                }
            });
        }
    }

    public clear(): void {
        this.socketSubs.forEach((sub: Subscription) => sub.unsubscribe());
        this.players.forEach((player: Player) => player.clear());
        this.playersSubs.forEach((_: Array<Subscription>, playerName: string) => {
            this.clearPlayerSubscriptions(playerName);
        });
    }
}
