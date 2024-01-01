import { RoomService, ConnectionService, ExceptionTypeEnum, BadRequestException } from '/opt/nodejs/room-manager';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import {
    SocketPacketRequestPayload,
    RoomApiRequestTypeEnum,
    RoomSocketApiRequestTypedData,
    SocketPacketNotificationPayload,
    RoomSocketApiNotificationTypedData,
    RoomSocketApiResponseTypedData,
    SocketPacketResponsePayload,
    RoomApiResponseTypeEnum,
    RoomSocketApiNotificationEnum
} from '../types/socket-packet-payload.type';

export default abstract class MessageHandler {
    protected static readonly ERROR_PARSING: string = 'Payload not valid';
    protected static readonly ERROR_DATA_UNDEFINED: string = 'No data for the request';
    protected static readonly ERROR_PLAYER_NOT_FOUND: string = 'Player not found';

    protected readonly roomService: RoomService;
    protected readonly connectionService: ConnectionService = new ConnectionService();

    public constructor(
        private readonly apiGatewayManagementApiClient: ApiGatewayManagementApiClient,
        public readonly connectionId: string,
        private readonly payload: SocketPacketRequestPayload) {
        this.roomService = new RoomService();
    }

    /**
     * @throws {BadRequestException}
     */
    protected abstract handle(): Promise<void>;

    public async execute(): Promise<void> {
        try {
            await this.handle();
        } catch (e) {
            console.error(e);
            if (this.isBadRequestException(e)) {
                await this.replyError(e.message);
            }
            throw (e);
        }
    }

    protected isBadRequestException(e: unknown): e is BadRequestException {
        return !!e && typeof e === 'object' && 'type' in e && e.type === ExceptionTypeEnum.BAD_REQUEST;
    }

    protected getPayloadData<RequestType extends RoomApiRequestTypeEnum>(type: RequestType): RoomSocketApiRequestTypedData[RequestType] {
        if (!this.payload.data) {
            throw new BadRequestException(MessageHandler.ERROR_DATA_UNDEFINED);
        }

        if (!this.isSocketPacketRequestType(type, this.payload)) {
            throw new BadRequestException(MessageHandler.ERROR_PARSING);
        }

        return this.payload.data;
    }

    protected isSocketPacketRequestType<RequestType extends RoomApiRequestTypeEnum>(
        type: RequestType,
        payload: SocketPacketRequestPayload,
    ): payload is SocketPacketRequestPayload<RequestType> {
        return payload.type === type;
    }

    protected notify<Type extends RoomSocketApiNotificationEnum>(type: Type, to: string, data: RoomSocketApiNotificationTypedData[Type]): Promise<object> {
        const notification: SocketPacketNotificationPayload<Type> = {
            type,
            data,
        };

        const command = new PostToConnectionCommand({ ConnectionId: to, Data: JSON.stringify(notification) });
        return this.apiGatewayManagementApiClient.send(command);
    }

    protected reply<Type extends RoomApiResponseTypeEnum>(type: Type, data: RoomSocketApiResponseTypedData[Type]): Promise<object> {
        const response: SocketPacketResponsePayload<Type> = {
            id: this.payload.id,
            type,
            data,
        };

        const command = new PostToConnectionCommand({
            ConnectionId: this.connectionId,
            Data: JSON.stringify(response)
        });
        return this.apiGatewayManagementApiClient.send(command);
    }

    protected replyError(message: string): Promise<object> {
        return this.reply(RoomApiResponseTypeEnum.ERROR, { message });
    }
}
