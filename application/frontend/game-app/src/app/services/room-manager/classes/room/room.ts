import { NotifierFlow } from '@app/deprecated/notifier/notifier';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BehaviorSubject, Observable, Subject, Subscription, filter } from 'rxjs';
import { RoomNetworkEventType } from '../room-network/events/room-network-event';
import RoomNetworkPlayerAddEvent from '../room-network/events/room-network-player-add-event';
import RoomNetworkPlayerRemoveEvent from '../room-network/events/room-network-player-remove-event';
import RoomNetworkQueueAddEvent from '../room-network/events/room-network-queue-add-event';
import RoomNetworkQueueRemoveEvent from '../room-network/events/room-network-queue-remove-event';
import { RoomNetwork } from '../room-network/room-network';
import { LocalPlayer } from '../player/local-player';
import { Player } from '../player/player';

export class Room<RoomServiceNotification extends RoomMessage> {
    public get localPlayer(): LocalPlayer {
        return this._roomConnection.localPlayer;
    }

    public players: Map<string, Player> = new Map<string, Player>();
    private readonly _players$ = new BehaviorSubject<Player[]>([]);
    public readonly players$: Observable<Player[]> = this._players$.asObservable();
    private readonly _queue$ = new BehaviorSubject<string[]>([]);
    public readonly queue$: Observable<string[]> = this._queue$.asObservable();

    protected readonly publicMessenger$ = new Subject<RoomServiceNotification>();

    public get roomConnection(): RoomNetwork<RoomMessage> {
        return this._roomConnection;
    }

    private readonly roomConnectionSubscription: Subscription;

    public constructor(
        protected readonly roomApi: RoomSocketApi,
        private readonly _roomConnection: RoomNetwork<RoomMessage>
    ) {
        this.addPlayer(this.localPlayer);

        this.roomConnectionSubscription = this._roomConnection.onMessage$.subscribe((message) => this.onMessage(message));

        // FIXME: rework this like blockChain
        this._roomConnection.notifier.follow(RoomNetworkEventType.PLAYER_ADD, this, this.handleRoomPlayerAddEvent.bind(this));
        this._roomConnection.notifier.follow(RoomNetworkEventType.PLAYER_REMOVE, this, this.handleRoomPlayerRemoveEvent.bind(this));
        this._roomConnection.notifier.follow(RoomNetworkEventType.QUEUE_ADD, this, this.handleRoomQueueAddEvent.bind(this));
        this._roomConnection.notifier.follow(RoomNetworkEventType.QUEUE_REMOVE, this, this.handleRoomQueueRemoveEvent.bind(this));
    }

    public clear(): void {
        this.roomConnectionSubscription.unsubscribe();
        this._roomConnection.notifier.unfollow(RoomNetworkEventType.PLAYER_ADD, this);
        this._roomConnection.notifier.unfollow(RoomNetworkEventType.PLAYER_REMOVE, this);
        this._roomConnection.notifier.unfollow(RoomNetworkEventType.QUEUE_ADD, this);
        this._roomConnection.notifier.unfollow(RoomNetworkEventType.QUEUE_REMOVE, this);
        this._roomConnection.clear();

        this.roomApi.close();
    }

    // FIXME: rework messenger to be strict typed
    public messenger(messageType: string[] | string): Observable<RoomServiceNotification> {
        return this.publicMessenger$.asObservable().pipe(filter((message: RoomServiceNotification) => {
            if (Array.isArray(messageType)) {
                return messageType.includes(message.type);
            }

            return message.type === messageType;
        }));
    }

    public get roomManagerNotifier(): NotifierFlow<RoomNetworkEventType> {
        return this._roomConnection.notifier;
    }

    public get initiator(): boolean {
        return this._roomConnection.initiator;
    }

    public transmitMessage<T>(type: string, message: T): void {
        const roomServiceMessage: RoomMessage<string, T> = {
            from: this.localPlayer.name,
            type,
            payload: message,
            origin: MessageOriginType.ROOM_SERVICE
        };

        this.players.forEach((player: Player) => {
            player.sendData(roomServiceMessage);
        });
    }

    protected addPlayer(player: Player): void {
        this.players.set(player.name, player);
        this._players$.next(Array.from(this.players.values()));
    }

    protected onMessage(message: RoomMessage): void {
        // TODO: rework this type
        this.publicMessenger$.next(message as RoomServiceNotification);
    }

    public get roomName(): string {
        return this._roomConnection.roomName;
    }

    protected handleRoomPlayerAddEvent(event: RoomNetworkPlayerAddEvent): void {
        const player: Player = event.payload;

        this.addPlayer(player);
    }

    protected handleRoomPlayerRemoveEvent(event: RoomNetworkPlayerRemoveEvent): void {
        const player: Player = event.payload;

        this.players.delete(player.name);
        this._players$.next(Array.from(this.players.values()));
    }

    protected handleRoomQueueAddEvent(event: RoomNetworkQueueAddEvent): void {
        const playerName: string = event.payload;
        this._queue$.next(this._queue$.getValue().concat(playerName));
    }

    protected handleRoomQueueRemoveEvent(event: RoomNetworkQueueRemoveEvent): void {
        const playerName: string = event.payload;
        this._queue$.next(this._queue$.getValue().filter((name: string) => name !== playerName));
    }
}
