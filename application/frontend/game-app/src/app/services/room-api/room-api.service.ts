import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Subscription } from 'rxjs';

import { Signal } from '../../classes/webrtc/webrtc';

import RoomCreateRequest from './requests/room-create-request';
import RoomJoinRequest from './requests/room-join-request';
import PlayerRequest from './requests/player-request';
import SignalRequest from './requests/signal-request';

import PlayerResponse from './responses/player-response';
import SignalResponse from './responses/signal-response';
import RoomJoinResponse from './responses/room-join-response';
import RoomCreateResponse from './responses/room-create-response';
import ErrorResponse from './responses/error-response';

import SignalNotification from './notifications/signal-notification';
import JoinNotification from './notifications/join-notification';

import { WebSocketService, SocketPayload } from '../web-socket/web-socket.service';
import FullRequest from './requests/full-request';
import FullResponse from './responses/full-response';
import FullNotification from './notifications/full-notification';
import PlayersResponse from './responses/players-response';
import PlayersRequest from './requests/players-request';
import Notifier, { NotifierFlow } from '../../classes/notifier/notifier';

export interface PacketPayload extends SocketPayload {
    id: number;
}

export enum RoomApiRequestType {
    CREATE = 'create',
    JOIN = 'join',
    PLAYER_GET_ALL = 'playerGetAll',
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove',
    FULL = 'full',
    SIGNAL = 'signal'
}

export enum RoomApiResponseType {
    ERROR = 'error',
    JOINING_ROOM = 'joiningRoom',
    ADDED = 'added',
    REMOVED = 'removed',
    SIGNAL_SENT = 'signalSent',
    FULL_SENT = 'fullSent',
    CREATE = 'created'
}

export enum RoomApiNotificationType {
    FULL = 'full',
    JOIN_REQUEST = 'joinRequest',
    REMOTE_SIGNAL = 'remoteSignal'
}

type RoomApiNotification = SignalNotification | JoinNotification | FullNotification;
type RequestId = number;

@Injectable({
    providedIn: 'root'
})
export class RoomApiService {

    private static readonly requestIdGenerator: Generator = function* name(): Generator {
        let id: RequestId = 0;
        while (true) {
            yield ++id;
        }
    }();

    private static readonly SOCKET_MESSAGE_KEY: string = 'sendmessage';
    private static readonly ERROR_REQUEST_TIMEOUT: string = 'The request has timeout. Request id:';
    private static readonly ERROR_SEND: string = 'The message was not sent';

    private readonly _notifier: Notifier<RoomApiNotificationType, RoomApiNotification> = new Notifier<RoomApiNotificationType, RoomApiNotification>();

    private readonly requestTimers: Map<RequestId, NodeJS.Timer> = new Map<RequestId, NodeJS.Timer>();
    private readonly subs: Array<Subscription> = [];

    public constructor(private readonly webSocketService: WebSocketService) { }

    public get notifier(): NotifierFlow<RoomApiNotificationType, RoomApiNotification> {
        return this._notifier;
    }

    public setup(): void {
        this.webSocketService.connect(new WebSocket(environment.webSocketServer));
        this.subs.push(this.webSocketService.message.subscribe((payload: PacketPayload) => this.onMessage(payload)));
    }

    private onMessage(payload: PacketPayload): void {
        if (payload.id > 0) {
            return;
        }
        const type: RoomApiNotificationType = payload.type as RoomApiNotificationType;
        this._notifier.notify(type, JSON.parse(payload.data));
    }

    private buildPacket(requestType: string, data: string): PacketPayload {
        return {
            type: requestType,
            data,
            id: RoomApiService.requestIdGenerator.next().value
        };
    }

    public create(roomName: string, maxPlayer: number, playerName: string): Promise<RoomCreateResponse> {
        const request: RoomCreateRequest = { roomName, maxPlayer, playerName };
        return this.send(this.buildPacket(RoomApiRequestType.CREATE, JSON.stringify(request)));
    }

    public join(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const request: RoomJoinRequest = { roomName, playerName };
        return this.send(this.buildPacket(RoomApiRequestType.JOIN, JSON.stringify(request)));
    }

    public allPlayers(roomName: string): Promise<PlayersResponse> {
        const request: PlayersRequest = { roomName };
        return this.send(this.buildPacket(RoomApiRequestType.PLAYER_GET_ALL, JSON.stringify(request)));
    }

    public addPlayer(roomName: string, playerName: string): Promise<PlayerResponse> {
        const request: PlayerRequest = { roomName, playerName };
        return this.send(this.buildPacket(RoomApiRequestType.PLAYER_ADD, JSON.stringify(request)));
    }

    public removePlayer(roomName: string, playerName: string): Promise<PlayerResponse> {
        const request: PlayerRequest = { roomName, playerName };
        return this.send(this.buildPacket(RoomApiRequestType.PLAYER_REMOVE, JSON.stringify(request)));
    }

    public signal(signal: Signal, to: string, roomName: string): Promise<SignalResponse> {
        const request: SignalRequest = { signal, to, roomName };
        return this.send(this.buildPacket(RoomApiRequestType.SIGNAL, JSON.stringify(request)));
    }

    public full(to: string, roomName: string): Promise<FullResponse> {
        const request: FullRequest = { to, roomName };
        return this.send(this.buildPacket(RoomApiRequestType.FULL, JSON.stringify(request)));
    }

    private send<T>(payload: PacketPayload): Promise<T> {

        if (this.webSocketService.send(RoomApiService.SOCKET_MESSAGE_KEY, JSON.stringify(payload)) === false) {
            return Promise.reject(RoomApiService.ERROR_SEND);
        }
        return this.followRequestResponse(payload.id);
    }

    private followRequestResponse<T>(id: number): Promise<T> {
        return new Promise(
            (resolve: (value: T) => void, reject: (err: string) => void): void => {
                const sub: Subscription = this.webSocketService.message.subscribe((payload: PacketPayload) => {
                    if (payload.id !== id) {
                        return;
                    }

                    clearTimeout(this.requestTimers.get(id));
                    this.requestTimers.delete(id);

                    if (payload.type !== RoomApiResponseType.ERROR) {
                        const data: T = JSON.parse(payload.data);
                        resolve(data);
                    } else {
                        const error: ErrorResponse = JSON.parse(payload.data);
                        reject(error.message);
                    }

                    if (sub.closed === false) {
                        sub.unsubscribe();
                    }
                });

                this.detectRequestTimeout(id, sub, reject);
            });
    }

    private detectRequestTimeout(id: RequestId, sub: Subscription, reject: (err: string) => void): void {
        const lambdaTimeout: number = 4000; // 3 seconds is the lambda AWS timeout, so add one more minute to it
        const timerId: NodeJS.Timer = setTimeout(() => {

            if (sub.closed === false) {
                sub.unsubscribe();
            }
            this.requestTimers.delete(id);
            reject(`${RoomApiService.ERROR_REQUEST_TIMEOUT} ${id}`);
            console.error(`${RoomApiService.ERROR_REQUEST_TIMEOUT} ${id}`);
        }, lambdaTimeout); // 3 seconds is the lambda AWS timeout, so add one more minute to it

        this.requestTimers.set(id, timerId);
    }

    public isSocketOpen(): boolean {
        return this.webSocketService.isOpen();
    }

    public close(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.webSocketService.close();
    }
}
