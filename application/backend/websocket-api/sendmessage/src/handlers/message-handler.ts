import { APIGatewayProxyEvent } from 'aws-lambda';
import RequestPayload from 'src/interfaces/request-payload';
import ResponsePayload from 'src/interfaces/response-payload';
import ErrorResponse from 'src/interfaces/error-response';
import JoinRequest from 'src/interfaces/join-request';
import CreateRequest from 'src/interfaces/create-request';
import SignalRequest from 'src/interfaces/signal-request';
import PlayerRequest from 'src/interfaces/player-request';
import { RoomService, ConnectionService, ExceptionType } from '/opt/nodejs/room-manager';
import FullRequest from 'src/interfaces/full-request';

type RequestType = JoinRequest | CreateRequest | SignalRequest | PlayerRequest | FullRequest;

export enum RequestPayloadType {
    SIGNAL = 'signal',
    CREATE = 'create',
    JOIN = 'join',
    FULL = 'full',
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove'
}

export enum ResponsePayloadType {
    REMOTE_SIGNAL = 'remoteSignal',
    SIGNAL_SENT = 'signalSent',
    FULL_SENT = 'fullSent',
    FULL = 'full',
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
            if (e.type === ExceptionType.BAD_REQUEST) {
                await this.replyError(e.message);
            }
            throw (e);
        }
    }

    protected sendTo(to: string, data: ResponsePayload): Promise<object> {
        data.id = -1; // Data that is not a reply does not have a id. Set to -1 for not disrupting the exchanges
        return this.apigwManagementApi.postToConnection({ ConnectionId: to, Data: JSON.stringify(data) }).promise();
    }

    protected reply(data: ResponsePayload): Promise<object> {
        return this.apigwManagementApi.postToConnection({ ConnectionId: this.connectionId, Data: JSON.stringify(data) }).promise();
    }

    protected replyError(message: string): Promise<object> {
        return this.reply(this.errorResponse(message));
    }

    protected errorResponse(message: string): ResponsePayload {
        const response: ErrorResponse = { message };
        return this.response(ResponsePayloadType.ERROR, response);
    }

    protected response(type: ResponsePayloadType, data: any): ResponsePayload {
        return {
            id: this.payload.id,
            type,
            data: JSON.stringify(data)
        };
    }
}

export default MessageHandler;
