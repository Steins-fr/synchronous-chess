import { Subscription, Subject, Observable, ReplaySubject } from 'rxjs';

import { RoomApiService } from 'src/app/services/room-api/room-api.service';

import { Message } from '../webrtc/messages/message';
import { RoomMessage } from '../webrtc/messages/room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';

import { NegotiatorEventType, Negotiator, NegotiatorEvent } from '../negotiator/negotiator';
import {
    Player,
    PlayerEventType,
    PlayerEvent
} from '../player/player';
import RoomEvent from './events/room-event';
import RoomPlayerAddEvent from './events/room-player-add-event';
import RoomQueueAddEvent from './events/room-queue-add-event';
import RoomPlayerRemoveEvent from './events/room-player-remove-event';
import RoomQueueRemoveEvent from './events/room-queue-remove-event';

export type RoomEventPayload = string;

export abstract class RoomManager {
    protected playersSubs: Map<string, Array<Subscription>> = new Map<string, Array<Subscription>>();
    protected negotiatorsSubs: Map<string, Array<Subscription>> = new Map<string, Array<Subscription>>();

    protected localPlayer?: Player;
    protected players: Map<string, Player> = new Map<string, Player>();
    public negotiators: Map<string, Negotiator> = new Map<string, Negotiator>();
    protected initiator: boolean;
    public isSetup: boolean = false;

    private _onMessage: Subject<Message>;
    private readonly _events: ReplaySubject<RoomEvent> = new ReplaySubject<RoomEvent>(3);
    public readonly events: Observable<RoomEvent> = this._events.asObservable();

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

    private pushEvent(event: RoomEvent): void {
        this._events.next(event);
    }

    // Room creation

    protected setLocalPlayer(playerName: string): void {
        this.localPlayer = new Player(playerName);
        this.pushEvent(new RoomPlayerAddEvent(this.localPlayer));
        this.players.set(this.localPlayer.name, this.localPlayer);
    }

    // Remote player creation

    protected addNegotiator(negotiator: Negotiator): void {
        this.negotiators.set(negotiator.playerName, negotiator);
        this.subscribeNegotiatorConnected(negotiator);
        this.subscribeNegotiatorDisconnected(negotiator);
        this.pushEvent(new RoomQueueAddEvent(negotiator.playerName));
    }

    protected addPlayer(player: Player): void {
        this.players.set(player.name, player);
        this.subscribeData(player);
        this.subscribeOnDisconnected(player);
        this.pushEvent(new RoomPlayerAddEvent(player));
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
                    this.removePlayer(p);
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

    private removePlayer(player: Player): void {
        if (this.players.has(player.name)) {
            this.pushEvent(new RoomPlayerRemoveEvent(player));
            this.players.delete(player.name);
            player.clear();
            this.clearSubscriptions(this.playersSubs, player.name);
        }
    }

    // Negotiator events

    private subscribeNegotiatorConnected(negotiator: Negotiator): void {
        const sub: Subscription = negotiator.event.subscribe((negotiatorEvent: NegotiatorEvent) => {
            if (negotiatorEvent.type === NegotiatorEventType.CONNECTED) {
                if (this.negotiators.has(negotiatorEvent.playerName)) {
                    const n: Negotiator = this.negotiators.get(negotiatorEvent.playerName);
                    const player: Player = new Player(n.playerName, n.webRTC);
                    this.removeNegotiator(negotiatorEvent.playerName);
                    this.addPlayer(player);
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
        if (this.negotiators.has(playerName)) {
            this.pushEvent(new RoomQueueRemoveEvent(playerName));
            const negotiator: Negotiator = this.negotiators.get(playerName);
            this.negotiators.delete(playerName);
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
        this.negotiators.forEach((negotiator: Negotiator) => {
            negotiator.clear();
            this.clearSubscriptions(this.negotiatorsSubs, negotiator.playerName);
        });
    }
}
