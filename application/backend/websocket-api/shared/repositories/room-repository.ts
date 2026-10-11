import Player from '@models/player';
import Room from '@models/room';
import BadRequestException from '@exceptions/bad-request-exception';
import { RoomGame } from '@protocol/room-game.enum';
import { getRoomsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

/** What the list of the rooms reads of a room: the attributes the indexes by game hold */
export type ListedRoom = Pick<Room, 'id' | 'hostPlayer' | 'players' | 'maxPlayer' | 'passwordHash' | 'expiresAt'>;

/** The attributes of a room the indexes by game project, beside their keys (infrastructure/main.tf, local/local-api.ts) */
export const LISTED_ROOM_ATTRIBUTES: readonly string[] = ['hostPlayer', 'players', 'maxPlayer', 'passwordHash', 'expiresAt'];

/** A room not expired at `:now`: its host connected, or the room waiting for it */
const NOT_EXPIRED: string = 'attribute_not_exists(expiresAt) OR expiresAt > :now';

export default class RoomRepository extends BaseRepository<Room> {
    /** The index of the rooms by game, sorted by creation */
    public static readonly GAME_INDEX: string = 'game-index';
    /** The index of the rooms by game, sorted by the search key of their name: searched by its start */
    public static readonly NAME_INDEX: string = 'game-name-index';

    protected readonly tableName: string = getRoomsTableName();
    protected readonly defaultProjection: string = 'id, connectionId, players, queue, hostPlayer, maxPlayer, game, createdAt, nameKey, passwordHash, tokenHashes, expiresAt';

    protected override getKey(item: Room): DocumentAttributes {
        return {
            id: item.id,
        };
    }

    public async getByName(roomName: string): Promise<Room | null> {
        return await this.find({ id: roomName });
    }

    /**
     * The most recent rooms of the game which did not expire at `now`, the last created first, through the index by
     * game and creation: their host connected, or the room waiting for it
     * @param maxRooms the most rooms read: the cost of the query
     */
    public async findRecentRooms(game: RoomGame, now: number, maxRooms: number): Promise<ListedRoom[]> {
        return this.queryIndex<ListedRoom>(
            RoomRepository.GAME_INDEX,
            { expression: 'game = :game', attributeValues: { ':game': game } },
            { expression: NOT_EXPIRED, attributeValues: { ':now': now } },
            RoomRepository.listedRoomProjection(),
            { maxItems: maxRooms, lastFirst: true },
        );
    }

    /**
     * The rooms of the game not expired at `now` whose name starts with the search, whatever the case, through the index
     * by game and name: DynamoDB reads the matching rooms only, by name, the name equal to the search first
     * @param search the search key (search.helper) of the start of the name
     * @param maxRooms the most rooms read: the cost of the query
     */
    public async findRoomsStartingWith(game: RoomGame, search: string, now: number, maxRooms: number): Promise<ListedRoom[]> {
        return this.queryIndex<ListedRoom>(
            RoomRepository.NAME_INDEX,
            { expression: 'game = :game AND begins_with(nameKey, :search)', attributeValues: { ':game': game, ':search': search } },
            { expression: NOT_EXPIRED, attributeValues: { ':now': now } },
            RoomRepository.listedRoomProjection(),
            { maxItems: maxRooms, lastFirst: false },
        );
    }

    private static listedRoomProjection(): string {
        return ['id', ...LISTED_ROOM_ATTRIBUTES].join(', ');
    }

    /**
     * Creates the room, replacing an expired room of the same name: a room waiting for its host keeps its name
     * @returns false when a room of that name exists at `now`: nothing created
     */
    public async create(room: Room, now: number): Promise<boolean> {
        return this.putIf(room, { expression: 'attribute_not_exists(id) OR expiresAt <= :now', attributeValues: { ':now': now } });
    }

    /** Lets the room wait until `expiresAt` for its host, unless the host already reconnected it to another connection */
    public async waitForHost(room: Room, hostConnectionId: string, expiresAt: number): Promise<void> {
        await this.updateItemIf(room, 'SET expiresAt = :expiresAt', {
            expression: 'connectionId = :hostConnectionId',
            attributeValues: { ':hostConnectionId': hostConnectionId },
        }, { ':expiresAt': expiresAt });
    }

    /**
     * Moves the room to a connection of the player, which becomes its host: the host, or another player while the room
     * waits for its host. The room no longer waits for its host
     * @returns false when the token hash is not the one of the player (another room took its name), the room expired at
     * `now`, or the player is not the host while the host is connected
     */
    public async reconnectHost(room: Room, connectionId: string, playerName: string, tokenHash: string, now: number): Promise<boolean> {
        return this.updateItemIf(room, 'SET connectionId = :connectionId, hostPlayer = :playerName REMOVE expiresAt', {
            expression: 'tokenHashes.#playerName = :tokenHash AND (attribute_not_exists(expiresAt) OR expiresAt > :now)'
                + ' AND (hostPlayer = :playerName OR attribute_exists(expiresAt))',
            attributeValues: { ':playerName': playerName, ':tokenHash': tokenHash, ':now': now },
            attributeNames: { '#playerName': playerName },
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

        await this.updateItem(room, `REMOVE players[${ index }], tokenHashes.#playerName`, undefined, { '#playerName': playerName });
    }

    /** Queues the player, keeping the hash of its token */
    public async addPlayerToQueue(player: Player, tokenHash: string, room: Room): Promise<void> {
        await this.updateItem(room, 'set queue = list_append(queue, :items), tokenHashes.#playerName = :tokenHash', {
            ':items': [player],
            ':tokenHash': tokenHash,
        }, { '#playerName': player.playerName });
    }

    public async removePlayerFromQueue(connectionId: string, room: Room): Promise<void> {
        const index: number = room.queue.findIndex((player: Player): boolean => player.connectionId === connectionId);
        if (index === -1) {
            throw new BadRequestException('Player not in the queue');
        }

        await this.updateItem(room, `REMOVE queue[${ index }]`);
    }

}
