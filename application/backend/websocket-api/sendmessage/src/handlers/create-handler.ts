import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import CreateRequest from 'src/interfaces/create-request';
import { PutItemInputAttributeMap } from 'aws-sdk/clients/dynamodb';
import RoomDocument from 'src/entities/room-document';
import CreateResponse from 'src/interfaces/create-response';


export default class CreateHandler extends MessageHandler {

    private static readonly ERROR_ROOM_ALREADY_EXIST: string = 'Room already exists';

    protected data: CreateRequest | undefined;

    public constructor(ddb: AWS.DynamoDB,
        tableName: string,
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(ddb, tableName, apigwManagementApi, event, payload);
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

        if (await this.roomExist(this.data.roomName)) {
            throw new Error(CreateHandler.ERROR_ROOM_ALREADY_EXIST);
        }

        await this.createRoom(this.data);

        await this.sendTo(this.connectionId, this.createResponse(this.data));
    }

    private createRoom(data: CreateRequest): Promise<AWS.DynamoDB.PutItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.PutItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {
            const item: PutItemInputAttributeMap & RoomDocument = {
                ID: { S: data.roomName },
                connectionId: { S: this.connectionId },
                hostPlayer: { S: data.playerName },
                maxPlayer: { N: `${data.maxPlayer}` },
                players: {
                    L: [
                        { M: { playerName: { S: data.playerName }, connectionId: { S: this.connectionId } } }
                    ]
                },
                queue: { L: [] }
            };

            const putParams: AWS.DynamoDB.PutItemInput = {
                TableName: this.tableName,
                Item: item
            };

            this.ddb.putItem(putParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    private createResponse(data: CreateRequest): string {
        const response: CreateResponse = data;

        return this.response(ResponsePayloadType.CREATE, response);
    }
}
