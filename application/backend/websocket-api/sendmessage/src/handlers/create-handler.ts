import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import CreateRequest from 'src/interfaces/create-request';
import CreateResponse from 'src/interfaces/create-response';
import { BadRequestException } from '/opt/nodejs/room-manager';
import ResponsePayload from 'src/interfaces/response-payload';


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
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }

        try {
            const data: CreateRequest = JSON.parse(this.payload.data);
            if (!data.roomName || !data.maxPlayer || !data.playerName) {
                throw new BadRequestException(CreateHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new BadRequestException(CreateHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new BadRequestException(CreateHandler.ERROR_DATA_UNDEFINED);
        }

        if (await this.roomService.roomExist(this.data.roomName)) {
            throw new BadRequestException(CreateHandler.ERROR_ROOM_ALREADY_EXIST);
        }

        await this.connectionService.create({ connectionId: this.connectionId, roomName: this.data.roomName });
        await this.roomService.create(this.data.roomName, this.connectionId, this.data.playerName, this.data.maxPlayer);

        await this.reply(this.createResponse(this.data));
    }

    private createResponse(data: CreateRequest): ResponsePayload {
        const response: CreateResponse = data;

        return this.response(ResponsePayloadType.CREATE, response);
    }
}
