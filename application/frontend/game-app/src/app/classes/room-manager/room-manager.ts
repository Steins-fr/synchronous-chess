import { Subscription } from 'rxjs';

import { RoomApiService } from '../../services/room-api/room-api.service';

import { Message } from '../webrtc/messages/message';
import { RoomMessage } from '../webrtc/messages/room-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';

import { NegotiatorEventType, Negotiator, NegotiatorEvent } from '../negotiator/negotiator';
import {
    Player,
    PlayerEventType,
    PlayerEvent,
    PlayerType
} from '../player/player';
import RoomEvent, { RoomEventType } from './events/room-event';
import RoomPlayerAddEvent from './events/room-player-add-event';
import RoomQueueAddEvent from './events/room-queue-add-event';
import RoomPlayerRemoveEvent from './events/room-player-remove-event';
import RoomQueueRemoveEvent from './events/room-queue-remove-event';
import Notifier, { NotifierFlow } from '../notifier/notifier';

export type RoomEventPayload = string;
type OnMessageCallback = (message: Message) => void;

export abstract class RoomManager {

    protected localPlayer?: Player;
    protected players: Map<string, Player> = new Map<string, Player>();
    public negotiators: Map<string, Negotiator> = new Map<string, Negotiator>();
    public abstract readonly initiator: boolean;
    public isSetup: boolean = false;

    private _onMessage: OnMessageCallback;
    protected readonly _notifier: Notifier<RoomEventType, RoomEvent> = new Notifier<RoomEventType, RoomEvent>();

    public constructor(protected readonly roomApi: RoomApiService, public readonly roomName: string) { }

    public get notifier(): NotifierFlow<RoomEventType, RoomEvent> {
        return this._notifier;
    }

    public setup(onMessage: OnMessageCallback): void {
        this._onMessage = onMessage;
        this.isSetup = true;
    }

    protected transmitMessage(message: RoomMessage): void {
        this.players.forEach((player: Player) => {
            message.from = this.localPlayer.name;
            player.sendData(message);
        });
    }

    private pushEvent(event: RoomEvent): void {
        this._notifier.notify(event.type, event);
    }

    // Room creation

    protected setLocalPlayer(playerName: string, playerType: PlayerType): void {
        this.localPlayer = new Player(playerName, playerType);
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
        player.notifier.follow(PlayerEventType.MESSAGE, this, (playerEvent: PlayerEvent<RoomMessage>) => {
            const message: RoomMessage = playerEvent.message;
            if (message.origin !== MessageOriginType.ROOM_SERVICE) {
                this.onRoomMessage(message, playerEvent.name);
            } else {
                this._onMessage(message);
            }
        });
    }

    private subscribeOnDisconnected(player: Player): void {
        player.notifier.follow(PlayerEventType.DISCONNECTED, this, (playerEvent: PlayerEvent) => {
            if (this.players.has(playerEvent.name)) {
                const p: Player = this.players.get(playerEvent.name);
                this.onPlayerDisconnected(p);
                this.removePlayer(p);
            }
        });
    }

    protected abstract onPlayerConnected(player: Player): void;
    protected abstract onPlayerDisconnected(player: Player): void;

    private removePlayer(player: Player): void {
        if (this.players.has(player.name)) {
            this.pushEvent(new RoomPlayerRemoveEvent(player));
            this.players.delete(player.name);
            player.clear();
        }
    }

    // Negotiator events

    private subscribeNegotiatorConnected(negotiator: Negotiator): void {
        negotiator.notifier.follow(NegotiatorEventType.CONNECTED, this, (negotiatorEvent: NegotiatorEvent) => {
            if (this.negotiators.has(negotiatorEvent.playerName)) {
                const n: Negotiator = this.negotiators.get(negotiatorEvent.playerName);
                const player: Player = new Player(n.playerName, negotiator.playerType, n.webRTC);
                this.removeNegotiator(negotiatorEvent.playerName);
                this.addPlayer(player);
                this.onPlayerConnected(player);
            }
        });
    }

    private subscribeNegotiatorDisconnected(negotiator: Negotiator): void {
        negotiator.notifier.follow(NegotiatorEventType.DISCONNECTED, this, (negotiatorEvent: NegotiatorEvent) => {
            this.removeNegotiator(negotiatorEvent.playerName);
        });
    }

    private removeNegotiator(playerName: string): void {
        if (this.negotiators.has(playerName)) {
            this.pushEvent(new RoomQueueRemoveEvent(playerName));
            const negotiator: Negotiator = this.negotiators.get(playerName);
            this.negotiators.delete(playerName);
            negotiator.clear();
        }
    }

    // Cleaning

    public clear(): void {
        this.players.forEach((player: Player) => {
            player.clear();
        });
        this.negotiators.forEach((negotiator: Negotiator) => {
            negotiator.clear();
        });
    }
}
