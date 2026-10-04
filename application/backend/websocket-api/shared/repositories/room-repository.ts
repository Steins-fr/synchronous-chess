import Player from '@models/player';
import Room from '@models/room';
import BadRequestException from '@exceptions/bad-request-exception';
import { getRoomsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

export default class RoomRepository extends BaseRepository<Room> {

    protected readonly tableName: string = getRoomsTableName();
    protected readonly defaultProjection: string = 'id, connectionId, players, queue, hostPlayer, maxPlayer, hostTokenHash, expiresAt';

    protected override getKey(item: Room): DocumentAttributes {
        return {
            id: item.id,
        };
    }

    public async getByName(roomName: string): Promise<Room | null> {
        return await this.find({ id: roomName });
    }

    /**
     * Creates the room, replacing a room of the same name whose host is disconnected: its name is free again, like when
     * the room of a disconnected host was deleted
     * @returns false when a room of that name has its host connected: nothing created
     */
    public async create(room: Room): Promise<boolean> {
        return this.putIf(room, { expression: 'attribute_not_exists(id) OR attribute_exists(expiresAt)' });
    }

    /** Lets the room wait until `expiresAt` for its host, unless the host already reconnected it to another connection */
    public async waitForHost(room: Room, hostConnectionId: string, expiresAt: number): Promise<void> {
        await this.updateItemIf(room, 'SET expiresAt = :expiresAt', {
            expression: 'connectionId = :hostConnectionId',
            attributeValues: { ':hostConnectionId': hostConnectionId },
        }, { ':expiresAt': expiresAt });
    }

    /**
     * Moves the room to another connection of its host, which no longer waits for it
     * @returns false when the token hash is not the room's (another room took its name), or the room expired at `now`
     */
    public async reconnectHost(room: Room, connectionId: string, hostTokenHash: string, now: number): Promise<boolean> {
        return this.updateItemIf(room, 'SET connectionId = :connectionId REMOVE expiresAt', {
            expression: 'hostTokenHash = :hostTokenHash AND (attribute_not_exists(expiresAt) OR expiresAt > :now)',
            attributeValues: { ':hostTokenHash': hostTokenHash, ':now': now },
        }, { ':connectionId': connectionId });
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
