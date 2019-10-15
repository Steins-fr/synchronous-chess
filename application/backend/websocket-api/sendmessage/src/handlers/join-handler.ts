import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import RoomDocument from 'src/entities/room-document';
import JoinRequest from 'src/interfaces/join-request';
import JoinResponse from 'src/interfaces/join-response';


export default class JoinHandler extends MessageHandler {

    private static readonly ERROR_ROOM_NOT_EXIST: string = 'Room does not exist';
    private static readonly ERROR_ALREADY_IN_GAME: string = 'Already in game';
    private static readonly ERROR_ALREADY_IN_QUEUE: string = 'Already in queue';

    protected data: JoinRequest | undefined;

    public constructor(ddb: AWS.DynamoDB,
        tableName: string,
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(ddb, tableName, apigwManagementApi, event, payload);
    }

    protected parsePayload(): JoinRequest {
        if (this.payload.type !== RequestPayloadType.JOIN || !this.payload.data) {
            throw new Error(JoinHandler.ERROR_PARSING);
        }

        try {
            const data: JoinRequest = JSON.parse(this.payload.data);
            if (!data.roomName || !data.playerName) {
                throw new Error(JoinHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new Error(JoinHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new Error(JoinHandler.ERROR_DATA_UNDEFINED);
        }

        const room: RoomDocument = await this.getRoom(this.data.roomName);

        if (!room) {
            throw new Error(JoinHandler.ERROR_ROOM_NOT_EXIST);
        }

        if (this.isInGame(room, this.data.playerName)) {
            await this.sendTo(this.connectionId, this.errorResponse(JoinHandler.ERROR_ALREADY_IN_GAME));
            return;
        }

        if (this.isInQueue(room, this.data.playerName)) {
            await this.sendTo(this.connectionId, this.errorResponse(JoinHandler.ERROR_ALREADY_IN_QUEUE));
            return;
        }
        await this.addRoomQueue(this.data);

        await this.sendTo(this.connectionId, this.joinResponse(room));
        await this.sendTo(room.connectionId.S, this.joinHostResponse(this.data));
    }

    private addRoomQueue(data: JoinRequest): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: { S: data.roomName }
                },
                UpdateExpression: 'set queue = list_append(queue, :items)',
                ExpressionAttributeValues: {
                    ':items': { L: [{ M: { playerName: { S: data.playerName }, connectionId: { S: this.connectionId } } }] }
                }
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    private joinHostResponse(data: JoinRequest): string {
        const response: JoinResponse = {
            playerName: data.playerName,
        };

        return this.response(ResponsePayloadType.JOIN, response);
    }

    private joinResponse(room: RoomDocument): string {
        const response: JoinResponse = {
            playerName: room.hostPlayer.S,
        };

        return this.response(ResponsePayloadType.JOINING, response);
    }
}
