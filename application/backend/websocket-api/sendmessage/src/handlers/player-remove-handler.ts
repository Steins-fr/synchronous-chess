import { APIGatewayProxyEvent } from 'aws-lambda';
import MessageHandler, { ResponsePayloadType, RequestPayloadType } from './message-handler';
import RequestPayload from 'src/interfaces/request-payload';
import PlayerRequest from 'src/interfaces/player-request';
import PlayerResponse from 'src/interfaces/player-response';
import RoomDocument from 'src/entities/room-document';
import PlayerDocument from 'src/entities/player-document';
import { AttributeMap } from 'src/entities/types';


export default class PlayerRemoveHandler extends MessageHandler {

    protected data: PlayerRequest | undefined;

    public constructor(ddb: AWS.DynamoDB,
        tableName: string,
        apigwManagementApi: AWS.ApiGatewayManagementApi,
        event: APIGatewayProxyEvent,
        payload: RequestPayload) {
        super(ddb, tableName, apigwManagementApi, event, payload);
    }

    protected parsePayload(): PlayerRequest {
        if (this.payload.type !== RequestPayloadType.PLAYER_REMOVE || !this.payload.data) {
            throw new Error(PlayerRemoveHandler.ERROR_PARSING);
        }

        try {
            const data: PlayerRequest = JSON.parse(this.payload.data);
            if (!data.playerName || !data.roomName) {
                throw new Error(PlayerRemoveHandler.ERROR_PARSING);
            }
            return data;
        } catch (e) {
            throw new Error(PlayerRemoveHandler.ERROR_PARSING);
        }
    }

    protected async handle(): Promise<void> {
        if (!this.data) {
            throw new Error(PlayerRemoveHandler.ERROR_DATA_UNDEFINED);
        }

        const room: RoomDocument = await this.getRoomByKeys(this.connectionId, this.data.roomName);

        if (!room) {
            throw new Error(PlayerRemoveHandler.ERROR_ROOM_DOES_NOT_EXIST);
        }

        if (this.isInGame(room, this.data.playerName) === false) {
            throw new Error(PlayerRemoveHandler.ERROR_PLAYER_NOT_FOUND);
        }

        await this.removePlayerFromRoom(this.data.playerName, room);

        await this.sendTo(this.connectionId, this.playerRemoveResponse(this.data));
    }

    private removePlayerFromRoom(playerName: string, room: RoomDocument): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            let index: number = -1;
            room.players.L.forEach((playerMap: AttributeMap<PlayerDocument>, i: number) => {
                if (playerMap.M.playerName.S === playerName) {
                    index = i;
                }
            });

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: { S: room.ID.S },
                    connectionId: { S: room.connectionId.S }
                },
                UpdateExpression: `REMOVE players[${index}]`
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    private playerRemoveResponse(data: PlayerRequest): string {
        const response: PlayerResponse = data;

        return this.response(ResponsePayloadType.REMOVED, response);
    }
}
