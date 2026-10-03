import { inject, Injectable, InjectionToken } from '@angular/core';
import { idGenerator } from '@app/helpers/id-generator.helper';
import { objectHasValue } from '@app/helpers/object.helper';
import {
    requestToResponse,
    RequestToResponseType,
    RoomApiRequestTypeEnum,
    RoomApiResponseTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomSocketApiNotifications,
    RoomSocketApiRequestTypedData,
    RoomSocketApiResponseTypedData,
    SocketPacketRequestPayload,
    SocketPacketResponsePayload,
} from '@protocol/socket-packet-payload.type';
import { filter, first, map, Observable, Subject, takeUntil, tap } from 'rxjs';
import { WebSocketService } from '../web-socket/web-socket.service';

type SocketPacketAllPayload = SocketPacketResponsePayload | RoomSocketApiNotifications;

// Injection token for WebSocketServer
export const WEB_SOCKET_SERVER = new InjectionToken<string>('WebSocketServer');

@Injectable({
    providedIn: 'root'
})
export class RoomSocketApi {
    private static readonly SOCKET_MESSAGE_KEY: string = 'sendmessage';
    private static readonly ERROR_REQUEST_TIMEOUT: string = 'The request has timeout. Request id:';

    private readonly webSocketService: WebSocketService;
    private destroyRef = new Subject<void>();

    public constructor() {
        const webSocketServer: string = inject(WEB_SOCKET_SERVER);

        this.webSocketService = new WebSocketService(webSocketServer);
    }

    private static readonly requestIdGenerator: Generator<number, never> = idGenerator();

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

    private isSocketPacketNotificationPayload(payload: SocketPacketAllPayload): payload is RoomSocketApiNotifications {
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

    private isRequestResponse(payload: SocketPacketResponsePayload, id: number): boolean {
        return payload.id === id;
    }

    private followRequestResponse<ResponseType extends RoomApiResponseTypeEnum>(id: number, type: ResponseType): Promise<RoomSocketApiResponseTypedData[ResponseType]> {
        return new Promise(
            (resolve: (value: RoomSocketApiResponseTypedData[ResponseType]) => void, reject: (err: Error) => void): void => {
                const closeSub = new Subject<void>();

                const lambdaTimeout: number = 5000; // 3 seconds is the lambda AWS timeout, so add two more seconds to it
                const timerId = setTimeout(() => {
                    closeSub.next();
                    closeSub.complete();
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

                        closeSub.next();
                        closeSub.complete();
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
