import BaseRepository, { TableKey } from './base-repository';
import Room from '../entities/room';
import RoomDocument from 'src/schemas/room-document';

export default class RoomRepository extends BaseRepository<Room, RoomDocument> {

    protected readonly tableName: string = process.env.TABLE_NAME_ROOMS as string;
    protected readonly defaultProjection: string = 'ID, connectionId, players, queue, hostPlayer, maxPlayer';

    protected getKey(item: Room): TableKey {
        return this.marshall({
            ID: item.ID,
            connectionId: item.connectionId
        });
    }

    public getRoomByName(roomName: string): Promise<Room> {
        const paramValues: AWS.DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName }
        };
        return this.query(`ID = :roomName`, paramValues);
    }

    public getRoomByKeys(connectionId: string, roomName: string): Promise<Room> {
        const paramValues: AWS.DynamoDB.ExpressionAttributeValueMap = {
            ':roomName': { S: roomName },
            ':connectionId': { S: connectionId }
        };
        return this.query(`ID = :roomName AND connectionId = :connectionId`, paramValues);
    }
}
