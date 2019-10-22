import { APIGatewayProxyEvent } from 'aws-lambda';
import RequestPayload from 'src/interfaces/request-payload';
import ErrorResponse from 'src/interfaces/error-response';
import JoinRequest from 'src/interfaces/join-request';
import CreateRequest from 'src/interfaces/create-request';
import SignalRequest from 'src/interfaces/signal-request';
import PlayerRequest from 'src/interfaces/player-request';
import { RoomService, Player, Room, ConnectionService } from '/opt/nodejs/room-manager';

type RequestType = JoinRequest | CreateRequest | SignalRequest | PlayerRequest;

export enum RequestPayloadType {
    SIGNAL = 'signal',
    CREATE = 'create',
    JOIN = 'join',
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove'
}

export enum ResponsePayloadType {
    SIGNAL = 'remoteSignal',
    CREATE = 'created',
    JOIN = 'joinRequest',
    JOINING = 'joiningRoom',
    ADDED = 'added',
    REMOVED = 'removed',
    ERROR = 'error'
}

abstract class MessageHandler {
    protected static readonly ERROR_PARSING: string = 'Payload not valid';
    protected static readonly ERROR_SOCKET_CONNECTION: string = 'Socket connection undefined';
    protected static readonly ERROR_DATA_UNDEFINED: string = 'No data for the request';
    protected static readonly ERROR_ROOM_DOES_NOT_EXIST: string = 'Room does not exist';
    protected static readonly ERROR_PLAYER_NOT_FOUND: string = 'Player not found';

    protected data: any;
    public readonly connectionId: string;
    protected readonly roomService: RoomService;
    protected readonly connectionService: ConnectionService = new ConnectionService();

    public constructor(
        private readonly apigwManagementApi: AWS.ApiGatewayManagementApi,
        protected readonly event: APIGatewayProxyEvent,
        protected readonly payload: RequestPayload) {
        if (event.requestContext.connectionId === undefined) {
            throw Error(MessageHandler.ERROR_SOCKET_CONNECTION);
        }

        this.roomService = new RoomService();

        this.connectionId = event.requestContext.connectionId;
    }

    protected abstract parsePayload(): RequestType;
    protected async abstract handle(): Promise<void>;

    public async execute(): Promise<void> {
        try {
            this.data = this.parsePayload();
            await this.handle();
        } catch (e) {
            console.error(e);
            await this.sendTo(this.connectionId, this.errorResponse(e.message));
            throw (e);
        }
    }

    protected sendTo(to: string, data: string): Promise<object> {
        return this.apigwManagementApi.postToConnection({ ConnectionId: to, Data: data }).promise();
    }

    protected errorResponse(message: string): string {
        const response: ErrorResponse = { message };
        return this.response(ResponsePayloadType.ERROR, response);
    }

    protected response(type: ResponsePayloadType, data: any): string {
        const payload: any = {
            type,
            data: JSON.stringify(data)
        };

        return JSON.stringify(payload);
    }
}

export default MessageHandler;
