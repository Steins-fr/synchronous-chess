import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import PlayerRequest from 'src/interfaces/player-request';
import PlayerResponse from 'src/interfaces/player-response';
import RoomDocument from 'src/entities/room-document';


export default class PlayerAddHandler extends MessageHandler {

    protected data: PlayerRequest | undefined;

    public constructor(ddb: AWS.DynamoDB,
        tableName: string,
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(ddb, tableName, apigwManagementApi, event, payload);
    }

    protected parsePayload(): PlayerRequest {
        if (this.payload.type !== RequestPayloadType.PLAYER_ADD || !this.payload.data) {
            throw new Error(PlayerAddHandler.ERROR_PARSING);
        }

        try {
            const data: PlayerRequest = JSON.parse(this.payload.data);
            if (!data.playerName || !data.roomName) {
                throw new Error(PlayerAddHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new Error(PlayerAddHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new Error(PlayerAddHandler.ERROR_DATA_UNDEFINED);
        }

        const room: RoomDocument = await this.getRoomByKeys(this.connectionId, this.data.roomName);

        if (!room) {
            throw new Error(PlayerAddHandler.ERROR_ROOM_DOES_NOT_EXIST);
        }

        await this.addPlayerToRoom(this.data.playerName, room);

        await this.sendTo(this.connectionId, this.playerAddResponse(this.data));
    }

    private addPlayerToRoom(playerName: string, room: RoomDocument): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: { S: room.ID.S },
                    connectionId: { S: room.connectionId.S }
                },
                UpdateExpression: 'set players = list_append(players, :items)',
                ExpressionAttributeValues: {
                    ':items': { L: [{ M: { playerName: { S: playerName } } }] }
                }
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    private playerAddResponse(data: PlayerRequest): string {
        const response: PlayerResponse = data;

        return this.response(ResponsePayloadType.ADDED, response);
    }
}
