import { Injectable } from '@angular/core';
import { RtcSignal } from '@app/classes/webrtc/webrtc';
import { environment } from '@environments/environment';
import { Subscription } from 'rxjs';
import Notifier, { NotifierFlow } from '../../classes/notifier/notifier';
import { WebSocketService, SocketPayload } from '../web-socket/web-socket.service';
import FullNotification from './notifications/full-notification';
import JoinNotification from './notifications/join-notification';
import SignalNotification from './notifications/signal-notification';
import FullRequest from './requests/full-request';
import PlayerRequest from './requests/player-request';
import PlayersRequest from './requests/players-request';
import RoomCreateRequest from './requests/room-create-request';
import RoomJoinRequest from './requests/room-join-request';
import SignalRequest from './requests/signal-request';
import ErrorResponse from './responses/error-response';
import FullResponse from './responses/full-response';
import PlayerResponse from './responses/player-response';
import PlayersResponse from './responses/players-response';
import RoomCreateResponse from './responses/room-create-response';
import RoomJoinResponse from './responses/room-join-response';
import RtcSignalResponse from './responses/rtc-signal-response';

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

    public constructor(private readonly webSocketService: WebSocketService) { }

    public get notifier(): NotifierFlow<RoomApiNotificationType> {
        return this._notifier;
    }

    private static readonly requestIdGenerator: Generator = function* name(): Generator {
        let id: RequestId = 0;
        while (true) {
            ++id;
            yield id;
        }
    }();

    private static readonly SOCKET_MESSAGE_KEY: string = 'sendmessage';
    private static readonly ERROR_REQUEST_TIMEOUT: string = 'The request has timeout. Request id:';
    private static readonly ERROR_SEND: string = 'The message was not sent';

    private readonly _notifier = new Notifier<RoomApiNotificationType, RoomApiNotification>();

    private readonly requestTimers = new Map<RequestId, ReturnType<typeof setTimeout>>();
    private readonly subs: Array<Subscription> = [];

    private static buildPacket(requestType: string, data: string): PacketPayload {
        return {
            type: requestType,
            data,
            id: RoomApiService.requestIdGenerator.next().value
        };
    }

    public setup(): void {
        this.webSocketService.setup(environment.webSocketServer);
        this.subs.push(this.webSocketService.message.subscribe(payload => this.onMessage(payload)));
    }

    private onMessage(payload: SocketPayload): void {
        if (this.isPacketPayload(payload) && payload.id > 0) {
            console.log('onMessage return', payload);
            return;
        }

        const type: RoomApiNotificationType = payload.type as RoomApiNotificationType;
        this._notifier.notify(type, JSON.parse(payload.data));
    }

    public create(roomName: string, maxPlayer: number, playerName: string): Promise<RoomCreateResponse> {
        const request: RoomCreateRequest = { roomName, maxPlayer, playerName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.CREATE, JSON.stringify(request)));
    }

    public join(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const request: RoomJoinRequest = { roomName, playerName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.JOIN, JSON.stringify(request)));
    }

    public allPlayers(roomName: string): Promise<PlayersResponse> {
        const request: PlayersRequest = { roomName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.PLAYER_GET_ALL, JSON.stringify(request)));
    }

    public addPlayer(roomName: string, playerName: string): Promise<PlayerResponse> {
        const request: PlayerRequest = { roomName, playerName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.PLAYER_ADD, JSON.stringify(request)));
    }

    public removePlayer(roomName: string, playerName: string): Promise<PlayerResponse> {
        const request: PlayerRequest = { roomName, playerName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.PLAYER_REMOVE, JSON.stringify(request)));
    }

    public signal(signal: RtcSignal, to: string, roomName: string): Promise<RtcSignalResponse> {
        const request: SignalRequest = { signal, to, roomName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.SIGNAL, JSON.stringify(request)));
    }

    public full(to: string, roomName: string): Promise<FullResponse> {
        const request: FullRequest = { to, roomName };
        return this.send(RoomApiService.buildPacket(RoomApiRequestType.FULL, JSON.stringify(request)));
    }

    private send<T>(payload: PacketPayload): Promise<T> {
        this.webSocketService.send(RoomApiService.SOCKET_MESSAGE_KEY, JSON.stringify(payload));
        return this.followRequestResponse(payload.id);
    }

    private isPacketPayload<T>(payload: PacketPayload | T): payload is PacketPayload {
        return !!(payload as PacketPayload).id;
    }

    private followRequestResponse<T>(id: number): Promise<T> {
        return new Promise(
            (resolve: (value: T) => void, reject: (err: string) => void): void => {
                const sub: Subscription = this.webSocketService.message.subscribe(payload => {
                    if (!this.isPacketPayload(payload) || payload.id !== id) {
                        console.log('followRequestResponse return', payload);
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

                    if (!sub.closed) {
                        sub.unsubscribe();
                    }
                });

                this.detectRequestTimeout(id, sub, reject);
            });
    }

    private detectRequestTimeout(id: RequestId, sub: Subscription, reject: (err: string) => void): void {
        const lambdaTimeout: number = 5000; // 3 seconds is the lambda AWS timeout, so add two more seconds to it
        const timerId = setTimeout(() => {

            if (!sub.closed) {
                sub.unsubscribe();
            }
            this.requestTimers.delete(id);
            reject(`${ RoomApiService.ERROR_REQUEST_TIMEOUT } ${ id }`);
            console.error(`${ RoomApiService.ERROR_REQUEST_TIMEOUT } ${ id }`);
        }, lambdaTimeout); // 3 seconds is the lambda AWS timeout, so add one more minute to it

        this.requestTimers.set(id, timerId);
    }

    public close(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.webSocketService.close();
    }
}
