import { Subscription, Subject } from 'rxjs';

import { RoomApiService } from 'src/app/services/room-api/room-api.service';
import RoomCreateResponse from 'src/app/services/room-api/responses/room-create-response';
import RoomJoinResponse from 'src/app/services/room-api/responses/room-join-response';

import { Message } from '../webrtc/messages/message';
import { RoomMessage } from '../webrtc/messages/room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';

import { NegotiatorEventType, Negotiator, NegotiatorEvent } from '../negotiator/negotiator';
import {
    Player,
    PlayerEventType,
    PlayerEvent
} from '../player/player';

export abstract class Room {
    protected playersSubs: Map<string, Array<Subscription>> = new Map<string, Array<Subscription>>();
    protected negotiatorsSubs: Map<string, Array<Subscription>> = new Map<string, Array<Subscription>>();

    public localPlayer?: Player;
    public players: Map<string, Player> = new Map<string, Player>();
    public queue: Map<string, Negotiator> = new Map<string, Negotiator>();
    public initiator: boolean;
    public isSetup: boolean = false;
    public roomName: string = '';

    protected _onMessage: Subject<Message>;

    public constructor(protected readonly roomApi: RoomApiService) { }

    public setup(onMessage: Subject<Message>): void {
        this._onMessage = onMessage;
        this.isSetup = true;
    }

    public transmitMessage(message: RoomMessage): void {
        this.players.forEach((player: Player) => {
            message.from = this.localPlayer.name;
            player.sendData(message);
        });
    }

    // Room creation

    public create(roomName: string, playerName: string): Promise<RoomCreateResponse | RoomJoinResponse> {
        if (this.roomApi.isSocketOpen()) {
            this.roomName = roomName;
            this.localPlayer = new Player(playerName);
            this.players.set(this.localPlayer.name, this.localPlayer);
            return this.askRoomCreation();
        } else {
            return Promise.reject();
        }
    }

    protected abstract askRoomCreation(): Promise<RoomCreateResponse | RoomJoinResponse>;

    // Remote player creation

    protected addNegotiator(negotiator: Negotiator): void {
        this.queue.set(negotiator.playerName, negotiator);
        this.subscribeNegotiatorConnected(negotiator);
        this.subscribeNegotiatorDisconnected(negotiator);
    }

    protected addPlayer(player: Player): void {
        this.players.set(player.name, player);
        this.subscribeData(player);
        this.subscribeOnDisconnected(player);
    }

    protected abstract onRoomMessage(message: Message, fromPlayer: string): void;

    // Player events

    protected subscribeData(player: Player): void {
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent<RoomMessage>) => {
            if (playerEvent.type !== PlayerEventType.MESSAGE) {
                return;
            }
            const message: RoomMessage = playerEvent.message;
            if (message.origin !== MessageOriginType.ROOM_SERVICE) {
                this.onRoomMessage(message, playerEvent.name);
            } else {
                this._onMessage.next(message);
            }
        });
        this.pushSubscriptionForPlayer(player.name, sub);
    }

    private subscribeOnDisconnected(player: Player): void {
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent<Message>) => {
            if (playerEvent.type === PlayerEventType.DISCONNECTED) {
                if (this.players.has(playerEvent.name)) {
                    const p: Player = this.players.get(playerEvent.name);
                    this.onPlayerDisconnected(p);
                    this.players.delete(playerEvent.name);
                    p.clear();
                    this.clearSubscriptions(this.playersSubs, p.name);
                }
                sub.unsubscribe();
            }
        });
        this.pushSubscriptionForPlayer(player.name, sub); // To unsubscribe without receiving the event
    }

    private pushSubscriptionForPlayer(playerName: string, sub: Subscription): void {
        let subs: Array<Subscription> = [];
        if (this.playersSubs.has(playerName)) {
            subs = this.playersSubs.get(playerName);
        }
        subs.push(sub);
        this.playersSubs.set(playerName, subs);
    }

    protected abstract onPlayerConnected(player: Player): void;
    protected abstract onPlayerDisconnected(player: Player): void;

    // Negotiator events

    private subscribeNegotiatorConnected(negotiator: Negotiator): void {
        const sub: Subscription = negotiator.event.subscribe((negotiatorEvent: NegotiatorEvent) => {
            if (negotiatorEvent.type === NegotiatorEventType.CONNECTED) {
                if (this.queue.has(negotiatorEvent.playerName)) {
                    const n: Negotiator = this.queue.get(negotiatorEvent.playerName);
                    const player: Player = new Player(n.playerName, n.webRTC);
                    this.addPlayer(player);
                    this.removeNegotiator(negotiatorEvent.playerName);
                    this.onPlayerConnected(player);
                }
                sub.unsubscribe();
            }
        });
        this.pushSubscriptionForNegotiator(negotiator.playerName, sub); // To unsubscribe without receiving the event
    }

    private subscribeNegotiatorDisconnected(negotiator: Negotiator): void {
        const sub: Subscription = negotiator.event.subscribe((negotiatorEvent: NegotiatorEvent) => {
            if (negotiatorEvent.type === NegotiatorEventType.DISCONNECTED) {
                this.removeNegotiator(negotiatorEvent.playerName);
                sub.unsubscribe();
            }
        });
        this.pushSubscriptionForNegotiator(negotiator.playerName, sub); // To unsubscribe without receiving the event
    }

    private pushSubscriptionForNegotiator(playerName: string, sub: Subscription): void {
        let subs: Array<Subscription> = [];
        if (this.negotiatorsSubs.has(playerName)) {
            subs = this.negotiatorsSubs.get(playerName);
        }
        subs.push(sub);
        this.negotiatorsSubs.set(playerName, subs);
    }

    private removeNegotiator(playerName: string): void {
        if (this.queue.has(playerName)) {
            const negotiator: Negotiator = this.queue.get(playerName);
            this.queue.delete(playerName);
            negotiator.clear();
            this.clearSubscriptions(this.negotiatorsSubs, negotiator.playerName);
        }
    }

    // Cleaning

    private clearSubscriptions(map: Map<string, Array<Subscription>>, playerName: string): void {
        if (map.has(playerName)) {
            const subs: Array<Subscription> = map.get(playerName);
            subs.forEach((sub: Subscription) => {
                if (sub.closed === false) {
                    sub.unsubscribe();
                }
            });
        }
    }

    public clear(): void {
        this.players.forEach((player: Player) => {
            player.clear();
            this.clearSubscriptions(this.playersSubs, player.name);
        });
        this.queue.forEach((negotiator: Negotiator) => {
            negotiator.clear();
            this.clearSubscriptions(this.negotiatorsSubs, negotiator.playerName);
        });
    }
}
