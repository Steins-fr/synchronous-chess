import { Injectable, Inject, NgZone } from '@angular/core';
import { RtcSignal } from '@app/classes/webrtc/webrtc';
import { Subject, takeUntil, filter, map, first, Observable, tap } from 'rxjs';
import Notifier, { NotifierFlow } from '../../classes/notifier/notifier';
import { WebSocketService } from '../web-socket/web-socket.service';
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

export interface PacketPayload {
    id: number; // Positive number are reserved for followed messages, request and response share the same id, -1 is reserved for notifications
    type: string;
    data: string;
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
// Injection token for WebSocketServer
export const WEB_SOCKET_SERVER = 'WebSocketServer';

@Injectable({
    providedIn: 'root'
})
export class RoomApiService {

    private readonly webSocketService: WebSocketService;
    private destroyRef = new Subject<void>();

    public constructor(@Inject(WEB_SOCKET_SERVER) webSocketServer: string, zone: NgZone) {
        this.webSocketService = new WebSocketService(webSocketServer, zone);
    }

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

    private readonly _notifier = new Notifier<RoomApiNotificationType, RoomApiNotification>();

    private static buildPacket(requestType: string, data: string): PacketPayload {
        return {
            type: requestType,
            data,
            id: RoomApiService.requestIdGenerator.next().value
        };
    }

    public setup(): void {
        this.getPayloadMessage().pipe(takeUntil(this.destroyRef)).subscribe(payload => this.onMessage(payload));
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

    private async send<ResponseType>(payload: PacketPayload): Promise<ResponseType> {
        await this.webSocketService.send(RoomApiService.SOCKET_MESSAGE_KEY, JSON.stringify(payload));
        return this.followRequestResponse<ResponseType>(payload.id);
    }

    private getPayloadMessage(): Observable<PacketPayload> {
        return this.webSocketService.message
            .pipe(
                map((payload: string) => JSON.parse(payload) as PacketPayload),
                filter((payload: PacketPayload) => this.isPacketPayload(payload)),
            );
    }

    private onMessage(payload: PacketPayload): void {
        if (this.isPacketResponse(payload)) {
            return;
        }

        const type: RoomApiNotificationType = payload.type as RoomApiNotificationType;
        this._notifier.notify(type, JSON.parse(payload.data));
    }

    private isPacketPayload(payload: object): payload is PacketPayload {
        return 'id' in payload;
    }

    private isPacketResponse(payload: PacketPayload): boolean {
        return payload.id > 0;
    }

    private isRequestResponse(payload: PacketPayload, id: RequestId): boolean {
        return payload.id === id;
    }

    private followRequestResponse<Response>(id: number): Promise<Response> {
        return new Promise(
            (resolve: (value: Response) => void, reject: (err: Error) => void): void => {
                const closeSub = new Subject<void>();

                const lambdaTimeout: number = 5000; // 3 seconds is the lambda AWS timeout, so add two more seconds to it
                const timerId = setTimeout(() => {

                    if (!closeSub.closed) {
                        closeSub.next();
                        closeSub.complete();
                    }
                    reject(new Error(`${ RoomApiService.ERROR_REQUEST_TIMEOUT } ${ id }`));
                    console.error(`${ RoomApiService.ERROR_REQUEST_TIMEOUT } ${ id }`);
                }, lambdaTimeout); // 3 seconds is the lambda AWS timeout, so add one more minute to it

                this.getPayloadMessage()
                    .pipe(
                        filter((payload: PacketPayload) => this.isRequestResponse(payload, id)),
                        first(),
                        tap(() => clearTimeout(timerId)),
                        takeUntil(closeSub),
                        takeUntil(this.destroyRef)
                    )
                    .subscribe((payload: PacketPayload) => {
                        if (payload.type !== RoomApiResponseType.ERROR) {
                            console.log(payload);
                            const data: Response = JSON.parse(payload.data);
                            resolve(data);
                        } else {
                            console.error(payload);
                            const error: ErrorResponse = JSON.parse(payload.data);
                            reject(new Error(error.message));
                        }

                        if (!closeSub.closed) {
                            closeSub.next();
                            closeSub.complete();
                        }
                    });
            });
    }

    public close(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
        this.webSocketService.close();
    }
}
