import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Subscription, Observable } from 'rxjs';

import { Signal } from 'src/app/classes/webrtc/webrtc';

import RoomCreateRequest from './requests/room-create-request';
import RoomJoinRequest from './requests/room-join-request';
import PlayerRequest from './requests/player-request';
import SignalRequest from './requests/signal-request';

import PlayerResponse from './responses/player-response';
import SignalResponse from './responses/signal-response';
import RoomJoinResponse from './responses/room-join-response';
import RoomCreateResponse from './responses/room-create-response';
import ErrorResponse from './responses/error-response';

import { WebSocketService, SocketState, SocketPayload } from '../web-socket/web-socket.service';

export interface PacketPayload extends SocketPayload {
    id: number;
}

export enum RoomApiRequestType {
    CREATE = 'create',
    JOIN = 'join',
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove',
    SIGNAL = 'signal'
}

export enum RoomApiResponseType {
    ERROR = 'error',
    REMOTE_SIGNAL = 'remoteSignal',
    JOIN_REQUEST = 'joinRequest',
    JOINING_ROOM = 'joiningRoom'
}

@Injectable({
    providedIn: 'root'
})
export class RoomApiService {

    private static readonly requestIdGenerator: Generator = function* name(): Generator {
        let id: number = 0;
        while (true) {
            yield ++id;
        }
    }();

    private static readonly SOCKET_MESSAGE_KEY: string = 'sendmessage';

    public socketState: SocketState = SocketState.CONNECTING;
    public readonly state: Observable<SocketState>;
    public readonly message: Observable<SocketPayload>;
    protected subs: Array<Subscription> = [];

    public constructor(private readonly webSocketService: WebSocketService) {
        this.state = this.webSocketService.state;
        this.message = this.webSocketService.message;
    }

    public setup(): void {
        this.webSocketService.connect(new WebSocket(environment.webSocketServer));
        this.subs.push(this.webSocketService.state.subscribe((state: SocketState) => {
            this.socketState = state;
        }));
    }

    private buildPacket(requestType: string, data: string): PacketPayload {
        const payload: PacketPayload = {
            type: requestType,
            data,
            id: RoomApiService.requestIdGenerator.next().value
        };
        return payload;
    }

    public create(roomName: string, maxPlayer: number, playerName: string): Promise<RoomCreateResponse> {
        const request: RoomCreateRequest = { roomName, maxPlayer, playerName };
        return this.send(this.buildPacket(RoomApiRequestType.CREATE, JSON.stringify(request)));
    }

    public join(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const request: RoomJoinRequest = { roomName, playerName };
        return this.send(this.buildPacket(RoomApiRequestType.JOIN, JSON.stringify(request)));
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

    private send<T>(payload: PacketPayload): Promise<T> {
        const messageListener: Promise<T> = this.followRequestResponse(payload.id);

        if (this.webSocketService.send(RoomApiService.SOCKET_MESSAGE_KEY, JSON.stringify(payload)) === false) {
            return Promise.reject();
        }
        return messageListener;
    }

    private followRequestResponse<T>(id: number): Promise<T> {
        return new Promise(
            (resolve: (value: T) => void, reject: (err: string) => void): void => {
                const sub: Subscription = this.webSocketService.message.subscribe((payload: PacketPayload) => {
                    if (payload.id !== id) {
                        return;
                    }

                    if (payload.type !== RoomApiResponseType.ERROR) {
                        const data: T = JSON.parse(payload.data);
                        resolve(data);
                    } else {
                        const error: ErrorResponse = JSON.parse(payload.data);
                        reject(error.message);
                    }
                    // TODO: timeout
                    sub.unsubscribe();
                });
            });
    }

    public isSocketOpen(): boolean {
        return this.socketState === SocketState.OPEN;
    }

    public close(): void {
        this.webSocketService.close();
    }
}
