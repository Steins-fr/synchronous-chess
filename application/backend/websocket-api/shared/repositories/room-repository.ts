import Player from '@models/player';
import Room from '@models/room';
import BadRequestException from '@exceptions/bad-request-exception';
import { getRoomsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

export default class RoomRepository extends BaseRepository<Room> {

    protected readonly tableName: string = getRoomsTableName();
    protected readonly defaultProjection: string = 'id, connectionId, players, queue, hostPlayer, maxPlayer';

    protected override getKey(item: Room): DocumentAttributes {
        return {
            id: item.id,
        };
    }

    public async getByName(roomName: string): Promise<Room | null> {
        return await this.find({ id: roomName });
    }

    public async addPlayerToRoom(player: Player, room: Room): Promise<void> {
        await this.updateItem(room, 'set players = list_append(players, :items)', {
            ':items': [player]
        });
    }

    public async removePlayerFromRoom(playerName: string, room: Room): Promise<void> {
        const index: number = room.players.findIndex((player: Player): boolean => player.playerName === playerName);
        if (index === -1) {
            throw new BadRequestException('Player not in the room');
        }

        await this.updateItem(room, `REMOVE players[${ index }]`);
    }

    public async addPlayerToQueue(player: Player, room: Room): Promise<void> {
        await this.updateItem(room, 'set queue = list_append(queue, :items)', {
            ':items': [player]
        });
    }

    public async removePlayerFromQueue(connectionId: string, room: Room): Promise<void> {
        const index: number = room.queue.findIndex((player: Player): boolean => player.connectionId === connectionId);
        if (index === -1) {
            throw new BadRequestException('Player not in the queue');
        }

        await this.updateItem(room, `REMOVE queue[${ index }]`);
    }

}
