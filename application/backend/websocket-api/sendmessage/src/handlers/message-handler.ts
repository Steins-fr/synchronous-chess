import { APIGatewayProxyEvent } from 'aws-lambda';
import RequestPayload from 'src/interfaces/request-payload';
import RoomDocument from 'src/entities/room-document';
import { AttributeMap } from 'src/entities/types';
import PlayerDocument from 'src/entities/player-document';
import ErrorResponse from 'src/interfaces/error-response';
import JoinRequest from 'src/interfaces/join-request';
import CreateRequest from 'src/interfaces/create-request';
import SignalRequest from 'src/interfaces/signal-request';
import PlayerRequest from 'src/interfaces/player-request';
import { DynamoDB } from 'aws-sdk';

export type UpdatePutItemOutput = AWS.DynamoDB.UpdateItemOutput | AWS.DynamoDB.PutItemOutput;
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

    protected static readonly ROOM_PROJECTION: string = 'ID, connectionId, players, queue, hostPlayer, maxPlayer';

    protected data: any;
    public readonly connectionId: string;

    public constructor(
        protected readonly ddb: AWS.DynamoDB,
        protected readonly tableName: string,
        private readonly apigwManagementApi: AWS.ApiGatewayManagementApi,
        protected readonly event: APIGatewayProxyEvent,
        protected readonly payload: RequestPayload) {
        if (event.requestContext.connectionId === undefined) {
            throw Error(MessageHandler.ERROR_SOCKET_CONNECTION);
        }

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

    protected async roomExist(roomName: string): Promise<boolean> {
        const room: RoomDocument = await this.getRoomByName(roomName);
        return room.ID !== undefined;
    }

    protected getRoomByName(roomName: string): Promise<RoomDocument> {
        const paramValues: DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName }
        };
        return this.getRoom(`ID = :roomName`, paramValues);
    }

    protected getRoomByKeys(connectionId: string, roomName: string): Promise<RoomDocument> {
        const paramValues: DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName },
            ':connectionId': { S: connectionId }
        };
        return this.getRoom(`ID = :roomName AND connectionId = :connectionId`, paramValues);
    }

    private getRoom(keys: string, paramValues: DynamoDB.ExpressionAttributeValueMap): Promise<RoomDocument> {
        return new Promise((resolve: (value: any) => void, reject: (value: AWS.AWSError) => void): void => { // TYPEDEF
            const params: AWS.DynamoDB.QueryInput = {
                TableName: this.tableName,
                KeyConditionExpression: keys,
                ExpressionAttributeValues: paramValues,
                ProjectionExpression: MessageHandler.ROOM_PROJECTION,
                Limit: 1
            };

            this.ddb.query(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.QueryOutput) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(roomData.Count === 0 || roomData === undefined || roomData.Items === undefined ? {} : roomData.Items.shift());
            });
        });
    }

    protected genUpdatePutCallback(resolve: (value: UpdatePutItemOutput) => void,
        reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: UpdatePutItemOutput) => void {
        return (err: AWS.AWSError, output: UpdatePutItemOutput): void => {
            if (err) {
                reject(err);
                return;
            }
            resolve(output);
        };
    }

    protected errorResponse(message: string): string {
        const response: ErrorResponse = { message };
        return this.response(ResponsePayloadType.ERROR, response);
    }

    protected findPlayerWith(players: Array<AttributeMap<PlayerDocument>>, test: (player: PlayerDocument) => boolean): PlayerDocument | null {
        for (let i: number = 0; i < players.length; ++i) {
            const player: PlayerDocument = players[i].M;
            if (test(player)) {
                return player;
            }
        }
        return null;
    }

    protected findPlayerByName(players: Array<AttributeMap<PlayerDocument>>, playerName: string): PlayerDocument | null {
        const playerNameTest: (player: PlayerDocument) => boolean = (player: PlayerDocument): boolean => player.playerName.S === playerName;
        return this.findPlayerWith(players, playerNameTest);
    }

    protected findPlayerConnectionId(players: Array<AttributeMap<PlayerDocument>>, connectionId: string): PlayerDocument | null {
        const connectionIdTest: (player: PlayerDocument) => boolean = (player: PlayerDocument): boolean =>
            player.connectionId !== undefined && player.connectionId.S === connectionId;
        return this.findPlayerWith(players, connectionIdTest);
    }

    protected getPlayerByName(room: RoomDocument, playerName: string): PlayerDocument | null {
        return this.findPlayerByName(room.players.L, playerName) || this.findPlayerByName(room.queue.L, playerName);
    }

    protected getPlayerByConnectionId(room: RoomDocument, connectionId: string): PlayerDocument | null {
        return this.findPlayerConnectionId(room.players.L, connectionId) || this.findPlayerConnectionId(room.queue.L, connectionId);
    }

    protected isInQueue(room: RoomDocument, playerName: string): boolean {
        return !!this.findPlayerByName(room.queue.L, playerName);
    }

    protected isInGame(room: RoomDocument, playerName: string): boolean {
        return !!this.findPlayerByName(room.players.L, playerName);
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
