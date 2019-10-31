import BaseRepository, { TableKey } from './base-repository';
import Room from '../entities/room';
import RoomDocument from '../schemas/room-document';
import Player from '../entities/player';
import * as AWS from 'aws-sdk';
import Exception from '../exceptions/exception';
import BadRequestException from '../exceptions/bad-request-exception';

export default class RoomRepository extends BaseRepository<Room, RoomDocument> {

    protected readonly tableName: string = process.env.TABLE_NAME_ROOMS as string;
    protected readonly defaultProjection: string = 'ID, connectionId, players, queue, hostPlayer, maxPlayer';

    protected getKey(item: Room): TableKey {
        return this.marshall({
            ID: item.ID,
            connectionId: item.connectionId
        });
    }

    public async getByName(roomName: string): Promise<Room> {
        const paramValues: AWS.DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName }
        };

        const room: Room | null = await this.query(`ID = :roomName`, paramValues);

        if (room === null) {
            throw new BadRequestException(`Room '${roomName}' does not exist`);
        }

        return room;
    }

    public async getByKeys(connectionId: string, roomName: string): Promise<Room> {
        const paramValues: AWS.DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName },
            ':connectionId': { S: connectionId }
        };
        const room: Room | null = await this.query(`ID = :roomName AND connectionId = :connectionId`, paramValues);

        if (room === null) {
            throw new BadRequestException(`Room '${roomName}' does not exist`);
        }

        return room;
    }

    public addPlayerToRoom(player: Player, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: Exception) => void): void => {
            const playersToAdd: Array<Player> = [player];
            const expectedRoom: AWS.DynamoDB.AttributeMap = AWS.DynamoDB.Converter.marshall({ players: playersToAdd });

            const updateParams: AWS.DynamoDB.UpdateItemInput = this.genUpdateInput(
                room,
                'set players = list_append(players, :items)',
                {
                    ':items': expectedRoom.players
                }
            );

            this.ddb.updateItem(updateParams, this.genUpdateItemCallback(resolve, reject));
        });
    }

    public removePlayerFromRoom(playerName: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: Exception) => void): void => {
            const index: number = room.players.findIndex((player: Player) => player.playerName === playerName);
            if (index === -1) {
                reject(new BadRequestException('Player not in the room'));
                return;
            }

            const updateParams: AWS.DynamoDB.UpdateItemInput = this.genUpdateInput(room, `REMOVE players[${index}]`);

            this.ddb.updateItem(updateParams, this.genUpdateItemCallback(resolve, reject));
        });
    }

    public addPlayerToQueue(player: Player, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: Exception) => void): void => {
            const playersToAdd: Array<Player> = [player];
            const expectedRoom: AWS.DynamoDB.AttributeMap = AWS.DynamoDB.Converter.marshall({ queue: playersToAdd });

            const updateParams: AWS.DynamoDB.UpdateItemInput = this.genUpdateInput(
                room,
                'set queue = list_append(queue, :items)',
                {
                    ':items': expectedRoom.queue
                }
            );

            this.ddb.updateItem(updateParams, this.genUpdateItemCallback(resolve, reject));
        });
    }

    public removePlayerFromQueue(connectionId: string, room: Room): Promise<AWS.DynamoDB.UpdateItemOutput> {
        return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: Exception) => void): void => {
            const index: number = room.queue.findIndex((player: Player) => player.connectionId === connectionId);
            if (index === -1) {
                reject(new BadRequestException('Player not in the queue'));
                return;
            }

            const updateParams: AWS.DynamoDB.UpdateItemInput = this.genUpdateInput(room, `REMOVE queue[${index}]`);

            this.ddb.updateItem(updateParams, this.genUpdateItemCallback(resolve, reject));
        });
    }


}
