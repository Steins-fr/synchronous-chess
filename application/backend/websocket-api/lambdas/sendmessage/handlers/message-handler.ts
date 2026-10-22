import { ApiGatewayManagementApiClient, GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import {
    SocketPacketRequestPayload,
    RoomApiRequestTypeEnum,
    RoomSocketApiRequestTypedData,
    RoomSocketApiNotificationTypedData,
    RoomSocketApiResponseTypedData,
    SocketPacketResponsePayload,
    RoomApiResponseTypeEnum,
    RoomSocketApiNotificationEnum
} from '@protocol/socket-packet-payload.type';
import BadRequestException, { isBadRequestException } from '@exceptions/bad-request-exception';
import { notificationCommand } from '@helpers/notification.helper';
import Connection from '@models/connection';
import ConnectionService from '@services/connection-service';
import DisconnectionService from '@services/disconnection-service';
import RoomService from '@services/room-service';

export default abstract class MessageHandler {
    protected static readonly ERROR_PARSING: string = 'Payload not valid';
    protected static readonly ERROR_DATA_UNDEFINED: string = 'No data for the request';
    protected static readonly ERROR_PLAYER_NOT_FOUND: string = 'Player not found';

    protected readonly roomService: RoomService;
    protected readonly connectionService: ConnectionService = new ConnectionService();
    // The connection the request wrote, undone if it closed meanwhile
    private connection: Connection | undefined;

    /** @param sourceIp the IP of the client, or its connection without it: the clients a private room tells apart */
    public constructor(
        private readonly apiGatewayManagementApiClient: ApiGatewayManagementApiClient,
        public readonly connectionId: string,
        private readonly payload: SocketPacketRequestPayload,
        protected readonly sourceIp: string = connectionId) {
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
            if (isBadRequestException(e)) {
                await this.replyError(e.message);
            }
            throw (e);
        }
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

    /** Writes the connection of the room: what $disconnect reads to leave it */
    protected async createConnection(roomName: string): Promise<void> {
        const connection: Connection = { connectionId: this.connectionId, roomName };
        await this.connectionService.create(connection);
        this.connection = connection;
    }

    protected notify<Type extends RoomSocketApiNotificationEnum>(type: Type, to: string, data: RoomSocketApiNotificationTypedData[Type]): Promise<object> {
        return this.apiGatewayManagementApiClient.send(notificationCommand(type, to, data));
    }

    /**
     * Answers the request, last of its handler. The connection closed while the request ran, waiting for the paused
     * database to resume for one: $disconnect found nothing to undo then, or ran between the writes of the request, so it
     * is disconnected here, its room told and left as $disconnect does
     */
    protected async reply<Type extends RoomApiResponseTypeEnum>(type: Type, data: RoomSocketApiResponseTypedData[Type]): Promise<void> {
        const response: SocketPacketResponsePayload<Type> = {
            id: this.payload.id,
            type,
            data,
        };

        const command = new PostToConnectionCommand({
            ConnectionId: this.connectionId,
            Data: JSON.stringify(response)
        });

        try {
            await this.apiGatewayManagementApiClient.send(command);
        } catch (e) {
            if (!(e instanceof GoneException)) {
                throw e;
            }

            console.warn(`Connection closed before its answer, disconnected: ${ this.connectionId }`);
            await new DisconnectionService((): ApiGatewayManagementApiClient => this.apiGatewayManagementApiClient).disconnect(this.connectionId, this.connection);
        }
    }

    protected replyError(message: string): Promise<void> {
        return this.reply(RoomApiResponseTypeEnum.ERROR, { message });
    }
}
