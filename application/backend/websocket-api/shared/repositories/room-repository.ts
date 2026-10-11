import Player from '@models/player';
import Room from '@models/room';
import BadRequestException from '@exceptions/bad-request-exception';
import { RoomGame } from '@protocol/room-game.enum';
import { getRoomsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

/** What the list of the rooms reads of a room: the attributes the index by game holds */
export type ListedRoom = Pick<Room, 'id' | 'createdAt' | 'hostPlayer' | 'players' | 'maxPlayer' | 'passwordHash' | 'expiresAt'>;

export default class RoomRepository extends BaseRepository<Room> {
    /** The index of the rooms by game, sorted by creation (infrastructure/main.tf), projecting the attributes of ListedRoom */
    public static readonly GAME_INDEX: string = 'game-index';

    protected readonly tableName: string = getRoomsTableName();
    protected readonly defaultProjection: string = 'id, connectionId, players, queue, hostPlayer, maxPlayer, game, createdAt, passwordHash, passwordFailures, passwordLocks, tokenHashes, expiresAt';

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
     * game: their host connected, or the room waiting for it
     * @param maxRooms the most rooms read: the cost of the query
     */
    public async findRecentRooms(game: RoomGame, now: number, maxRooms: number): Promise<ListedRoom[]> {
        return this.queryIndexLastFirst<ListedRoom>(
            RoomRepository.GAME_INDEX,
            { expression: 'game = :game', attributeValues: { ':game': game } },
            { expression: 'attribute_not_exists(expiresAt) OR expiresAt > :now', attributeValues: { ':now': now } },
            'id, createdAt, hostPlayer, players, maxPlayer, passwordHash, expiresAt',
            maxRooms,
        );
    }

    /**
     * Counts a wrong password of a client, in the maps a private room is created with
     * @param source the hash of the IP of the client
     * @returns the wrong passwords the client gave in a row, this one counted
     */
    public async recordPasswordFailure(room: Room, source: string): Promise<number> {
        const updated: Room = await this.updateItem(room, 'SET passwordFailures.#source = if_not_exists(passwordFailures.#source, :zero) + :one', {
            ':zero': 0,
            ':one': 1,
        }, { '#source': source });
        return (updated.passwordFailures as Record<string, number>)[source];
    }

    /** Refuses the passwords of a client until `lockedUntil`, in epoch seconds: the count of its failures starts again then */
    public async lockPassword(room: Room, source: string, lockedUntil: number): Promise<void> {
        await this.updateItem(room, 'SET passwordLocks.#source = :lockedUntil REMOVE passwordFailures.#source', { ':lockedUntil': lockedUntil }, { '#source': source });
    }

    /** The right password of a client given: its wrong ones before are forgotten */
    public async forgetPasswordFailures(room: Room, source: string): Promise<void> {
        await this.updateItem(room, 'REMOVE passwordFailures.#source, passwordLocks.#source', undefined, { '#source': source });
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
