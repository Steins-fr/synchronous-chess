import { Injectable, Inject, NgZone } from '@angular/core';
import { objectHasValue } from '@app/helpers/object.helper';
import { ValuesOf } from '@app/types/values-of.type';
import { Subject, takeUntil, filter, map, first, Observable, tap } from 'rxjs';
import { WebSocketService } from '../web-socket/web-socket.service';
import FullNotification from './notifications/full-notification';
import JoinNotification from './notifications/join-notification';
import SignalNotification from './notifications/signal-notification';
import FullRequest from './requests/full-request';
import PlayerRequest from './requests/player-request';
import PlayersRequest from './requests/players-request';
import RoomCreateRequest from './requests/room-create-request';
import RoomJoinRequest from './requests/room-join-request';
import RtcSignalRequest from './requests/signal-request';
import ErrorResponse from './responses/error-response';
import FullResponse from './responses/full-response';
import PlayerResponse from './responses/player-response';
import PlayersResponse from './responses/players-response';
import RoomCreateResponse from './responses/room-create-response';
import RoomJoinResponse from './responses/room-join-response';
import RtcSignalResponse from './responses/rtc-signal-response';

type RequestId = number;

interface SocketPacketPayload<Type, Data> {
    id: number; // Positive number are reserved for followed messages, request and response share the same id, -1 is reserved for notifications
    type: Type;
    data: Data;
}

// region RequestPayload
export enum RoomApiRequestTypeEnum {
    CREATE = 'create',
    JOIN = 'join',
    PLAYER_GET_ALL = 'playerGetAll',
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove',
    FULL = 'full',
    SIGNAL = 'signal'
}

type RoomSocketApiRequestTypedData = {
    'create': RoomCreateRequest,
    'join': RoomJoinRequest,
    'playerGetAll': PlayersRequest,
    'playerAdd': PlayerRequest,
    'playerRemove': PlayerRequest,
    'signal': RtcSignalRequest,
    'full': FullRequest,
};

type SocketPacketRequestPayload<Type extends RoomApiRequestTypeEnum = RoomApiRequestTypeEnum> = SocketPacketPayload<Type, RoomSocketApiRequestTypedData[Type]>;
// endregion

// region ResponsePayload
enum RoomApiResponseTypeEnum {
    ADDED = 'added',
    CREATED = 'created',
    ERROR = 'error',
    FULL_SENT = 'fullSent',
    JOINING_ROOM = 'joiningRoom',
    PLAYERS = 'players',
    REMOVED = 'removed',
    SIGNAL_SENT = 'signalSent',
}

type RoomSocketApiResponseType = `${ RoomApiResponseTypeEnum }`;
type RoomSocketApiResponseTypedData = {
    'added': PlayerResponse,
    'created': RoomCreateResponse,
    'error': ErrorResponse,
    'fullSent': FullResponse,
    'joiningRoom': RoomJoinResponse,
    'players': PlayersResponse,
    'removed': PlayerResponse,
    'signalSent': RtcSignalResponse,
};

type SocketPacketResponsePayload<Type extends RoomApiResponseTypeEnum = RoomApiResponseTypeEnum> = SocketPacketPayload<Type, RoomSocketApiResponseTypedData[Type]>;
// endregion

type RequestToResponseType<Type extends RoomApiRequestTypeEnum> = {
    [RoomApiRequestTypeEnum.CREATE]: RoomApiResponseTypeEnum.CREATED,
    [RoomApiRequestTypeEnum.JOIN]: RoomApiResponseTypeEnum.JOINING_ROOM,
    [RoomApiRequestTypeEnum.PLAYER_GET_ALL]: RoomApiResponseTypeEnum.PLAYERS,
    [RoomApiRequestTypeEnum.PLAYER_ADD]: RoomApiResponseTypeEnum.ADDED,
    [RoomApiRequestTypeEnum.PLAYER_REMOVE]: RoomApiResponseTypeEnum.REMOVED,
    [RoomApiRequestTypeEnum.SIGNAL]: RoomApiResponseTypeEnum.SIGNAL_SENT,
    [RoomApiRequestTypeEnum.FULL]: RoomApiResponseTypeEnum.FULL_SENT,
}[Type];

const requestToResponse: {
    [Type in RoomApiRequestTypeEnum]: RequestToResponseType<Type>
} = {
    [RoomApiRequestTypeEnum.CREATE]: RoomApiResponseTypeEnum.CREATED,
    [RoomApiRequestTypeEnum.JOIN]: RoomApiResponseTypeEnum.JOINING_ROOM,
    [RoomApiRequestTypeEnum.PLAYER_GET_ALL]: RoomApiResponseTypeEnum.PLAYERS,
    [RoomApiRequestTypeEnum.PLAYER_ADD]: RoomApiResponseTypeEnum.ADDED,
    [RoomApiRequestTypeEnum.PLAYER_REMOVE]: RoomApiResponseTypeEnum.REMOVED,
    [RoomApiRequestTypeEnum.SIGNAL]: RoomApiResponseTypeEnum.SIGNAL_SENT,
    [RoomApiRequestTypeEnum.FULL]: RoomApiResponseTypeEnum.FULL_SENT,
};

// region NotificationPayload
export enum RoomSocketApiNotificationEnum {
    FULL = 'full',
    JOIN_REQUEST = 'joinRequest',
    REMOTE_SIGNAL = 'remoteSignal'
}

// Compared to Response, Notification ara propagated as RoomSocketApiNotifications.
// So, we need to ensure that comparing `type` to `RoomSocketApiNotificationEnum` determines `data` type.
type RoomSocketApiNotificationType = `${ RoomSocketApiNotificationEnum }`;
type RoomSocketApiNotificationTypedData = {
    'full': FullNotification,
    'joinRequest': JoinNotification,
    'remoteSignal': SignalNotification,
};

type RoomSocketApiNotification<Type extends RoomSocketApiNotificationType> = {
    type: Type,
    data: RoomSocketApiNotificationTypedData[Type],
};

type SocketPacketNotificationPayloads = ValuesOf<{
    [Type in keyof RoomSocketApiNotificationTypedData]: RoomSocketApiNotification<Type>
}>;

export type RoomSocketApiNotifications = ValuesOf<{
    [Type in keyof RoomSocketApiNotificationTypedData]: RoomSocketApiNotification<Type>
}>;
// endregion

// Throw compilation error if colliding key in constants. Responsibility of this component because this is its behavior that defines that keys should not collide
type NotificationAndResponseCommonKeys = RoomSocketApiNotificationType & RoomSocketApiResponseType;
type NotificationAndResponseHasCommonKeys = NotificationAndResponseCommonKeys extends never ? 'NotificationAndResponseHasNoCommonKeys' : `Notifications cannot have same key than key registered in Responses, common key is -> ${NotificationAndResponseCommonKeys}`;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const notificationAndResponseHasCommonKeys: NotificationAndResponseHasCommonKeys = 'NotificationAndResponseHasNoCommonKeys';

type SocketPacketAllPayload = SocketPacketResponsePayload | SocketPacketNotificationPayloads;

// Injection token for WebSocketServer
export const WEB_SOCKET_SERVER = 'WebSocketServer';

@Injectable({
    providedIn: 'root'
})
export class RoomSocketApi {
    private static readonly SOCKET_MESSAGE_KEY: string = 'sendmessage';
    private static readonly ERROR_REQUEST_TIMEOUT: string = 'The request has timeout. Request id:';

    private readonly webSocketService: WebSocketService;
    private destroyRef = new Subject<void>();

    public constructor(@Inject(WEB_SOCKET_SERVER) webSocketServer: string, zone: NgZone) {
        this.webSocketService = new WebSocketService(webSocketServer, zone);
    }

    private static readonly requestIdGenerator: Generator = function* name(): Generator {
        let id: RequestId = 0;
        while (true) {
            ++id;
            yield id;
        }
    }();

    private static buildPacket<RequestType extends RoomApiRequestTypeEnum>(
        requestType: RequestType,
        data: RoomSocketApiRequestTypedData[RequestType],
    ): SocketPacketRequestPayload {
        return {
            type: requestType,
            data,
            id: RoomSocketApi.requestIdGenerator.next().value
        };
    }

    public get notification$(): Observable<RoomSocketApiNotifications> {
        return this.getPayloadMessage().pipe(filter(this.isSocketPacketNotificationPayload));
    }

    public async send<RequestType extends RoomApiRequestTypeEnum>(
        requestType: RequestType,
        body: RoomSocketApiRequestTypedData[RequestType]
    ): Promise<RoomSocketApiResponseTypedData[RequestToResponseType<RequestType>]> {
        const packet = await this.webSocketService.send(
            RoomSocketApi.SOCKET_MESSAGE_KEY,
            RoomSocketApi.buildPacket(requestType, body)
        );

        return this.followRequestResponse<RequestToResponseType<RequestType>>(packet.id, requestToResponse[requestType]);
    }

    private getPayloadMessage(): Observable<SocketPacketAllPayload> {
        return this.webSocketService.message
            .pipe(
                map((payload: string) => JSON.parse(payload)),
                filter(this.isPacketPayload),
            );
    }

    private isPacketPayload(payload: object): payload is SocketPacketAllPayload {
        const isPacketPayload = 'type' in payload;

        if (!isPacketPayload) {
            console.error('Received payload is not a packet', payload);
        }

        return isPacketPayload;
    }

    private isSocketPacketNotificationPayload(payload: SocketPacketAllPayload): payload is SocketPacketNotificationPayloads {
        return objectHasValue(RoomSocketApiNotificationEnum, payload.type);
    }

    private isSocketPacketResponsePayload(payload: SocketPacketAllPayload): payload is SocketPacketResponsePayload {
        return 'id' in payload && objectHasValue(RoomApiResponseTypeEnum, payload.type);
    }

    private isSocketPacketErrorResponse(
        payload: SocketPacketResponsePayload
    ): payload is SocketPacketResponsePayload<RoomApiResponseTypeEnum.ERROR> {
        return payload.type === RoomApiResponseTypeEnum.ERROR;
    }

    private isSocketPacketResponseType<ResponseType extends RoomApiResponseTypeEnum>(
        type: ResponseType,
        payload: SocketPacketResponsePayload,
    ): payload is SocketPacketResponsePayload<ResponseType> {
        return payload.type === type;
    }

    private isRequestResponse(payload: SocketPacketResponsePayload, id: RequestId): boolean {
        return payload.id === id;
    }

    private followRequestResponse<ResponseType extends RoomApiResponseTypeEnum>(id: number, type: ResponseType): Promise<RoomSocketApiResponseTypedData[ResponseType]> {
        return new Promise(
            (resolve: (value: RoomSocketApiResponseTypedData[ResponseType]) => void, reject: (err: Error) => void): void => {
                const closeSub = new Subject<void>();

                const lambdaTimeout: number = 5000; // 3 seconds is the lambda AWS timeout, so add two more seconds to it
                const timerId = setTimeout(() => {

                    if (!closeSub.closed) {
                        closeSub.next();
                        closeSub.complete();
                    }
                    reject(new Error(`${ RoomSocketApi.ERROR_REQUEST_TIMEOUT } ${ id }`));
                    console.error(`${ RoomSocketApi.ERROR_REQUEST_TIMEOUT } ${ id }`);
                }, lambdaTimeout); // 3 seconds is the lambda AWS timeout, so add one more minute to it

                this.getPayloadMessage()
                    .pipe(
                        filter(this.isSocketPacketResponsePayload),
                        filter(payload => this.isRequestResponse(payload, id)),
                        first(),
                        tap(() => clearTimeout(timerId)),
                        takeUntil(closeSub),
                        takeUntil(this.destroyRef)
                    )
                    .subscribe((payload) => {

                        if (this.isSocketPacketErrorResponse(payload)) {
                            console.error(payload);
                            reject(new Error(payload.data.message));
                        } else if (this.isSocketPacketResponseType(type, payload)) {
                            console.debug('Response received', payload);
                            resolve(payload.data);
                        } else {
                            console.error('Unexpected response type %s, expected %s', payload.type, type);
                            reject(new Error('Unexpected response type'));
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
