import * as AWS from 'aws-sdk';
import { PutItemInputAttributeMap } from 'aws-sdk/clients/dynamodb';
import Room from './entities/room';
import Player from './entities/player';
import RoomDocument from './entities/room-document';

type UpdatePutItemOutput = AWS.DynamoDB.UpdateItemOutput | AWS.DynamoDB.PutItemOutput;

export class RoomDatabase {

    protected static readonly ROOM_PROJECTION: string = 'ID, connectionId, players, queue, hostPlayer, maxPlayer';

    private readonly ddb: AWS.DynamoDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
    private readonly tableName: string = process.env.TABLE_NAME as string;

    private getRoom(keys: string, paramValues: AWS.DynamoDB.ExpressionAttributeValueMap): Promise<Room> {
        return new Promise((resolve: (value: Room) => void, reject: (value: AWS.AWSError) => void): void => {
            const params: AWS.DynamoDB.QueryInput = {
                TableName: this.tableName,
                KeyConditionExpression: keys,
                ExpressionAttributeValues: paramValues,
                ProjectionExpression: RoomDatabase.ROOM_PROJECTION,
                Limit: 1
            };

            this.ddb.query(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.QueryOutput) => {
                if (err) {
                    reject(err);
                    return;
                }

                const roomDocument: AWS.DynamoDB.AttributeMap = (roomData.Count === 0 || roomData === undefined || roomData.Items === undefined ? {} : roomData.Items.shift()) || {};

                resolve(AWS.DynamoDB.Converter.unmarshall(roomDocument) as Room);
            });
        });
    }

    private genUpdatePutCallback(resolve: (value: UpdatePutItemOutput) => void,
        reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: UpdatePutItemOutput) => void {
        return (err: AWS.AWSError, output: UpdatePutItemOutput): void => {
            if (err) {
                reject(err);
                return;
            }
            resolve(output);
        };
    }

    public getRoomByName(roomName: string): Promise<Room> {
        const paramValues: AWS.DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName }
        };
        return this.getRoom(`ID = :roomName`, paramValues);
    }

    public getRoomByKeys(connectionId: string, roomName: string): Promise<Room> {
        const paramValues: AWS.DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName },
            ':connectionId': { S: connectionId }
        };
        return this.getRoom(`ID = :roomName AND connectionId = :connectionId`, paramValues);
    }

    public async roomExist(roomName: string): Promise<boolean> {
        const room: Room = await this.getRoomByName(roomName);
        return room.ID !== undefined;
    }

    public addPlayerToRoom(playerName: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: { S: room.ID },
                    connectionId: { S: room.connectionId }
                },
                UpdateExpression: 'set players = list_append(players, :items)',
                ExpressionAttributeValues: {
                    ':items': { L: [{ M: { playerName: { S: playerName } } }] }
                }
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    public removePlayerFromRoom(playerName: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            let index: number = -1;
            room.players.forEach((player: Player, i: number) => {
                if (player.playerName === playerName) {
                    index = i;
                }
            });

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: { S: room.ID },
                    connectionId: { S: room.connectionId }
                },
                UpdateExpression: `REMOVE players[${index}]`
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    public addRoomQueue(playerName: string, connectionId: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableName,
                Key: {
                    ID: { S: room.ID },
                    connectionId: { S: room.connectionId }
                },
                UpdateExpression: 'set queue = list_append(queue, :items)',
                ExpressionAttributeValues: {
                    ':items': { L: [{ M: { playerName: { S: playerName }, connectionId: { S: connectionId } } }] }
                }
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    public createRoom(roomName: string, connectionId: string, playerName: string, maxPlayer: number): Promise<AWS.DynamoDB.PutItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.PutItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {
            const item: PutItemInputAttributeMap & RoomDocument = {
                ID: { S: roomName },
                connectionId: { S: connectionId },
                hostPlayer: { S: playerName },
                maxPlayer: { N: `${maxPlayer}` },
                players: {
                    L: [
                        { M: { playerName: { S: playerName } } }
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
}
