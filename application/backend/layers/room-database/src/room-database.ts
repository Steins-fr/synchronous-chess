import * as AWS from 'aws-sdk';
import { PutItemInputAttributeMap } from 'aws-sdk/clients/dynamodb';
import Room from './entities/room';
import Player from './entities/player';
import RoomDocument from './entities/room-document';
import Connection from './entities/connection';
import ConnectionDocument from './entities/connection-document';

type UpdatePutItemOutput = AWS.DynamoDB.UpdateItemOutput | AWS.DynamoDB.PutItemOutput;

export class RoomDatabase {

    protected static readonly ROOM_PROJECTION: string = 'ID, connectionId, players, queue, hostPlayer, maxPlayer';
    protected static readonly CONNECTION_PROJECTION: string = 'connectionId, roomName';

    private readonly ddb: AWS.DynamoDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
    private readonly tableNameRooms: string = process.env.TABLE_NAME_ROOMS as string;
    private readonly tableNameConnections: string = process.env.TABLE_NAME_CONNECTIONS as string;

    private getRoom(keys: string, paramValues: AWS.DynamoDB.ExpressionAttributeValueMap): Promise<Room> { // TODO: Room or Null
        return new Promise((resolve: (value: Room) => void, reject: (value: AWS.AWSError) => void): void => {
            const params: AWS.DynamoDB.QueryInput = {
                TableName: this.tableNameRooms,
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

    public getRoomNameByConnectionId(connectionId: string): Promise<string | null> {
        return new Promise((resolve: (value: string | null) => void, reject: (value: AWS.AWSError) => void): void => {
            const params: AWS.DynamoDB.GetItemInput = {
                TableName: this.tableNameConnections,
                Key: { connectionId: { S: connectionId } },
                ProjectionExpression: RoomDatabase.CONNECTION_PROJECTION,
            };

            this.ddb.getItem(params, (err: AWS.AWSError, connectionData: AWS.DynamoDB.GetItemOutput) => {
                if (err) {
                    reject(err);
                    return;
                }

                const connection: Connection = AWS.DynamoDB.Converter.unmarshall(connectionData.Item || {}) as Connection;

                resolve(connection.roomName || null);
            });
        });
    }

    private createConnection(connectionId: string, roomName: string): Promise<AWS.DynamoDB.PutItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.PutItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {
            const item: PutItemInputAttributeMap & ConnectionDocument = {
                connectionId: { S: connectionId },
                roomName: { S: roomName }
            };

            const putParams: AWS.DynamoDB.PutItemInput = {
                TableName: this.tableNameConnections,
                Item: item
            };

            this.ddb.putItem(putParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    private deleteConnection(connectionId: string): Promise<AWS.DynamoDB.DeleteItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.DeleteItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const deleteParams: AWS.DynamoDB.DeleteItemInput = {
                TableName: this.tableNameConnections,
                Key: { connectionId: { S: connectionId } }
            };

            this.ddb.deleteItem(deleteParams, this.genDeleteItemCallback(resolve, reject));
        });
    }

    public async removeConnectionIdFromRoom(room: Room, connectionId: string): Promise<void> {
        await this.deleteConnection(connectionId);
        if (room.connectionId === connectionId) {
            await this.deleteRoom(room);
        } else if (room.ID !== undefined) {
            await this.removePlayerFromQueue(connectionId, room);
        }
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

    private genDeleteItemCallback(resolve: (value: AWS.DynamoDB.DeleteItemOutput) => void,
        reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: AWS.DynamoDB.DeleteItemOutput) => void {
        return (err: AWS.AWSError, output: AWS.DynamoDB.DeleteItemOutput): void => {
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
                TableName: this.tableNameRooms,
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

            // TODO: -1 ?

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableNameRooms,
                Key: {
                    ID: { S: room.ID },
                    connectionId: { S: room.connectionId }
                },
                UpdateExpression: `REMOVE players[${index}]`
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    private removePlayerFromQueue(connectionId: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            let index: number = -1;
            room.queue.forEach((player: Player, i: number) => {
                if (player.connectionId === connectionId) {
                    index = i;
                }
            });

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableNameRooms,
                Key: {
                    ID: { S: room.ID },
                    connectionId: { S: room.connectionId }
                },
                UpdateExpression: `REMOVE queue[${index}]`
            };

            this.ddb.updateItem(updateParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    public addRoomQueue(playerName: string, connectionId: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            this.createConnection(connectionId, room.ID).then();

            const updateParams: AWS.DynamoDB.UpdateItemInput = {
                TableName: this.tableNameRooms,
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
            this.createConnection(connectionId, roomName).then();

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
                TableName: this.tableNameRooms,
                Item: item
            };

            this.ddb.putItem(putParams, this.genUpdatePutCallback(resolve, reject));
        });
    }

    public deleteRoom(room: Room): Promise<AWS.DynamoDB.DeleteItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.DeleteItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

            const deleteParams: AWS.DynamoDB.DeleteItemInput = {
                TableName: this.tableNameRooms,
                Key: { ID: { S: room.ID }, connectionId: { S: room.connectionId } }
            };

            this.ddb.deleteItem(deleteParams, this.genDeleteItemCallback(resolve, reject));
        });
    }
}
