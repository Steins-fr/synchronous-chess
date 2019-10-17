import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import CreateRequest from 'src/interfaces/create-request';
import CreateResponse from 'src/interfaces/create-response';


export default class CreateHandler extends MessageHandler {

    private static readonly ERROR_ROOM_ALREADY_EXIST: string = 'Room already exists';

    protected data: CreateRequest | undefined;

    public constructor(
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(apigwManagementApi, event, payload);
    }

    protected parsePayload(): CreateRequest {
        if (this.payload.type !== RequestPayloadType.CREATE || !this.payload.data) {
            throw new Error(CreateHandler.ERROR_PARSING);
        }

        try {
            const data: CreateRequest = JSON.parse(this.payload.data);
            if (!data.roomName || !data.maxPlayer || !data.playerName) {
                throw new Error(CreateHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new Error(CreateHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new Error(CreateHandler.ERROR_DATA_UNDEFINED);
        }

        if (await this.ddb.roomExist(this.data.roomName)) {
            throw new Error(CreateHandler.ERROR_ROOM_ALREADY_EXIST);
        }

        await this.ddb.createRoom(this.data.roomName, this.connectionId, this.data.playerName, this.data.maxPlayer);

        await this.sendTo(this.connectionId, this.createResponse(this.data));
    }

    private createResponse(data: CreateRequest): string {
        const response: CreateResponse = data;

        return this.response(ResponsePayloadType.CREATE, response);
    }
}
