import { APIGatewayProxyEvent } from 'aws-lambda';
import RequestPayload from 'src/interfaces/request-payload';
import RoomDocument from 'src/entities/room-document';
import { AttributeMap } from 'src/entities/types';
import PlayerDocument from 'src/entities/player-document';
import ErrorResponse from 'src/interfaces/error-response';
import JoinRequest from 'src/interfaces/join-request';
import CreateRequest from 'src/interfaces/create-request';
import SignalRequest from 'src/interfaces/signal-request';

export type UpdatePutItemOutput = AWS.DynamoDB.UpdateItemOutput | AWS.DynamoDB.PutItemOutput;
type RequestType = JoinRequest | CreateRequest | SignalRequest;

export enum RequestPayloadType {
    SIGNAL = 'signal',
    CREATE = 'create',
    JOIN = 'join'
}

export enum ResponsePayloadType {
    SIGNAL = 'remoteSignal',
    CREATE = 'created',
    JOIN = 'joinRequest',
    JOINING = 'joiningRoom',
    ERROR = 'error'
}

abstract class MessageHandler {
    public static readonly ERROR_PARSING: string = 'Payload not valid';
    public static readonly ERROR_SOCKET_CONNECTION: string = 'Socket connection undefined';
    public static readonly ERROR_DATA_UNDEFINED: string = 'No data for the request';

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
            await this.sendTo(this.connectionId, this.errorResponse(e.message));
            throw (e);
        }
    }

    protected sendTo(to: string, data: string): Promise<object> {
        return this.apigwManagementApi.postToConnection({ ConnectionId: to, Data: data }).promise();
    }

    protected roomExist(roomName: string): Promise<boolean> {
        return new Promise<boolean>((resolve: (value: boolean) => void, reject: (value: AWS.AWSError) => void): void => {

            const keys: AWS.DynamoDB.Key & Partial<RoomDocument> = {
                ID: {
                    S: roomName
                }
            };

            const params: AWS.DynamoDB.GetItemInput = {
                TableName: this.tableName,
                Key: keys,
                ProjectionExpression: 'ID'
            };

            this.ddb.getItem(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.GetItemOutput) => {
                if (err) {
                    reject(err);
                }

                resolve(!!roomData.Item);
            });
        });
    }

    protected getRoom(roomName: string): Promise<RoomDocument> {
        return new Promise((resolve: (value: any) => void, reject: (value: AWS.AWSError) => void): void => { // TYPEDEF
            const params: AWS.DynamoDB.GetItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: {
                        S: roomName
                    }
                },
                ProjectionExpression: MessageHandler.ROOM_PROJECTION
            };

            this.ddb.getItem(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.GetItemOutput) => {
                if (err) {
                    reject(err);
                }

                resolve(roomData.Item);
            });
        });
    }

    protected genUpdatePutCallback(resolve: (value: UpdatePutItemOutput) => void,
        reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: UpdatePutItemOutput) => void {
        return (err: AWS.AWSError, output: UpdatePutItemOutput): void => {
            if (err) {
                reject(err);
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
        const connectionIdTest: (player: PlayerDocument) => boolean = (player: PlayerDocument): boolean => player.connectionId.S === connectionId;
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
