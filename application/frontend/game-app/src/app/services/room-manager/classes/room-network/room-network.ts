import Notifier, { NotifierFlow } from '@app/deprecated/notifier/notifier';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import { ToReworkMessage } from '@app/services/room-manager/classes/webrtc/messages/to-rework-message';
import { BehaviorSubject, Subject } from 'rxjs';
import { Negotiator, NegotiatorEvent, NegotiatorEventType } from '../negotiator/negotiator';
import { LocalPlayer } from '../player/local-player';
import { Player, PlayerEvent, PlayerEventType } from '../player/player';
import { WebRtcPlayer } from '../player/web-rtc-player';
import RoomNetworkEvent, { RoomNetworkEventType } from './events/room-network-event';
import RoomNetworkPlayerAddEvent from './events/room-network-player-add-event';
import RoomNetworkPlayerRemoveEvent from './events/room-network-player-remove-event';
import RoomNetworkQueueAddEvent from './events/room-network-queue-add-event';
import RoomNetworkQueueRemoveEvent from './events/room-network-queue-remove-event';

export abstract class RoomNetwork<MessageType extends Message> {
    private readonly _localPlayer: LocalPlayer;

    public get localPlayer(): LocalPlayer {
        return this._localPlayer;
    }

    protected players: Map<string, Player> = new Map<string, Player>();
    private readonly negotiators = new BehaviorSubject<ReadonlyMap<string, Negotiator>>(new Map());
    public readonly negotiators$ = this.negotiators.asObservable();
    public abstract readonly initiator: boolean;

    protected readonly _notifier = new Notifier<RoomNetworkEventType, RoomNetworkEvent>();
    private readonly onMessageSubject = new Subject<MessageType>();
    public readonly onMessage$ = this.onMessageSubject.asObservable();

    protected constructor(
        protected readonly roomSocketApi: RoomSocketApi,
        public readonly roomName: string,
        localPlayerName: string,
    ) {
        this._localPlayer = new LocalPlayer(localPlayerName);
        this.players.set(this._localPlayer.name, this._localPlayer);
    }

    public get notifier(): NotifierFlow<RoomNetworkEventType> {
        return this._notifier;
    }

    protected transmitMessage(message: ToReworkMessage): void {
        this.players.forEach((player: Player) => {
            if (!player.isLocal) {
                message.from = this.localPlayer.name;
                player.sendData(message);
            }
        });
    }

    protected isPlayerNameAlreadyInRoom(playerName: string): boolean {
        const negotiators = this.negotiators.getValue();
        return this.players.has(playerName) || negotiators.has(playerName);
    }

    private pushEvent(event: RoomNetworkEvent): void {
        this._notifier.notify(event.type, event);
    }

    // Remote player creation

    protected addNegotiator(negotiator: Negotiator): void {
        const current = new Map(this.negotiators.getValue());
        current.set(negotiator.playerName, negotiator);
        this.negotiators.next(current);
        this.subscribeNegotiatorConnected(negotiator);
        this.subscribeNegotiatorDisconnected(negotiator);
        this.pushEvent(new RoomNetworkQueueAddEvent(negotiator.playerName));
    }

    protected getNegotiator(playerName: string): Negotiator | undefined {
        return this.negotiators.getValue().get(playerName);
    }

    protected addPlayer(player: WebRtcPlayer): void {
        this.players.set(player.name, player);
        this.subscribeData(player);
        this.subscribeOnDisconnected(player);
        this.pushEvent(new RoomNetworkPlayerAddEvent(player));
    }

    protected abstract onRoomMessage(message: Message, fromPlayer: string): void;

    // Player events
    protected subscribeData(player: WebRtcPlayer): void {
        player.notifier.follow(PlayerEventType.MESSAGE, this, (playerEvent: PlayerEvent<MessageType>) => {
            const message = playerEvent.message;
            this.onRoomMessage(message, playerEvent.name);
            this.onMessageSubject.next(message);
        });
    }

    private subscribeOnDisconnected(player: WebRtcPlayer): void {
        player.notifier.follow(PlayerEventType.DISCONNECTED, this, (playerEvent: PlayerEvent) => {
            if (this.players.has(playerEvent.name)) {
                const p: Player | undefined = this.players.get(playerEvent.name);

                if (!p) {
                    throw new Error('Player is not defined');
                }

                this.onPlayerDisconnected(p);
                this.removePlayer(p);
            }
        });
    }

    protected abstract onPlayerConnected(player: Player): void;
    protected abstract onPlayerDisconnected(player: Player): void;

    private removePlayer(player: Player): void {
        if (this.players.has(player.name)) {
            this.pushEvent(new RoomNetworkPlayerRemoveEvent(player));
            this.players.delete(player.name);
            player.clear();
        }
    }

    // Negotiator events

    private subscribeNegotiatorConnected(negotiator: Negotiator): void {
        negotiator.notifier.follow(NegotiatorEventType.CONNECTED, this, (negotiatorEvent: NegotiatorEvent) => {
            const negotiators = this.negotiators.getValue();
            if (negotiators.has(negotiatorEvent.playerName)) {
                const negotiator = negotiators.get(negotiatorEvent.playerName);
                if (!negotiator) {
                    throw new Error('Negotiator is not defined');
                }

                const player = new WebRtcPlayer(negotiator.playerName, negotiator.webRTC);
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
        const current = new Map(this.negotiators.getValue());
        const negotiator = current.get(playerName);

        if (negotiator) {
            this.pushEvent(new RoomNetworkQueueRemoveEvent(playerName));
            current.delete(playerName);
            this.negotiators.next(current);
            negotiator.clear();
        }
    }

    protected getNegotiatorSize(): number {
        return this.negotiators.getValue().size;
    }

    public clear(): void {
        this.players.forEach((player: Player) => {
            player.clear();
        });
        this.negotiators.getValue().forEach((negotiator: Negotiator) => {
            negotiator.clear();
        });
    }
}
