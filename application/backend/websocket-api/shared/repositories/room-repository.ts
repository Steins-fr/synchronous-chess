import { DatabaseTransaction } from '@database/database';
import { connections, roomPlayers, roomQueue, rooms, roomTokens } from '@database/schema';
import BadRequestException from '@exceptions/bad-request-exception';
import { DatabaseOperationEnum } from '@exceptions/database-exception';
import { escapeLike } from '@helpers/search.helper';
import Player from '@models/player';
import Room from '@models/room';
import { RoomGame } from '@protocol/room-game.enum';
import { ROOM_TAG_DIGITS, ROOM_TAG_SEPARATOR } from '@protocol/room-limits';
import { and, desc, eq, exists, gt, inArray, isNotNull, like, lte, or, SQL, sql } from 'drizzle-orm';
import BaseRepository from './base-repository';

/** What the list of the rooms reads of a room */
export type ListedRoom = Pick<Room, 'id' | 'hostPlayer' | 'maxPlayer' | 'isPrivate' | 'expiresAt'> & { playerCount: number };

/** A room as the relational query reads it */
interface RoomRow {
    id: string;
    connectionId: string;
    hostPlayer: string;
    maxPlayer: number;
    game: RoomGame;
    createdAt: string;
    nameKey: string;
    passwordHash: string | null;
    isPrivate: boolean;
    expiresAt: number | null;
    leaseUntil: number;
    players: { playerName: string }[];
    queue: { playerName: string, connectionId: string }[];
    tokens: { playerName: string, tokenHash: string }[];
}

interface ListedRoomRow {
    id: string;
    hostPlayer: string;
    maxPlayer: number;
    isPrivate: boolean;
    expiresAt: number | null;
    playerCount: number;
}

/** When a room ends, in epoch seconds: the wait for its host once disconnected, else its lease (index rooms_expiry) */
const ROOM_EXPIRY: SQL<number> = sql<number>`coalesce(${ rooms.expiresAt }, ${ rooms.leaseUntil })`;

/** A room not expired at `now`: its host connected, its lease running, or the room waiting for it */
function notExpired(now: number): SQL {
    return gt(ROOM_EXPIRY, now);
}

export default class RoomRepository extends BaseRepository {
    private static readonly LISTED_ROOM = {
        id: rooms.id,
        hostPlayer: rooms.hostPlayer,
        maxPlayer: rooms.maxPlayer,
        isPrivate: rooms.isPrivate,
        expiresAt: rooms.expiresAt,
        playerCount: sql<number>`(SELECT count(*)::int FROM ${ roomPlayers } WHERE ${ roomPlayers.roomId } = ${ rooms.id })`,
    };

    private static toRoom(row: RoomRow): Room {
        const room: Room = {
            id: row.id,
            connectionId: row.connectionId,
            hostPlayer: row.hostPlayer,
            maxPlayer: row.maxPlayer,
            game: row.game,
            createdAt: row.createdAt,
            nameKey: row.nameKey,
            isPrivate: row.isPrivate,
            leaseUntil: row.leaseUntil,
            players: row.players,
            queue: row.queue,
            tokenHashes: Object.fromEntries(row.tokens.map(({ playerName, tokenHash }: RoomRow['tokens'][number]): [string, string] => [playerName, tokenHash])),
        };

        if (row.passwordHash !== null) {
            room.passwordHash = row.passwordHash;
        }

        if (row.expiresAt !== null) {
            room.expiresAt = row.expiresAt;
        }

        return room;
    }

    private static toListedRoom({ expiresAt, ...row }: ListedRoomRow): ListedRoom {
        return expiresAt === null ? row : { ...row, expiresAt };
    }

    /** The room, with its players and its queue in the order they joined: a single statement, read by each signal relayed */
    public async getByName(roomName: string): Promise<Room | null> {
        const row: RoomRow | undefined = await this.run(DatabaseOperationEnum.GET, (): Promise<RoomRow | undefined> => this.db.query.rooms.findFirst({
            where: { id: roomName },
            with: {
                players: { columns: { playerName: true }, orderBy: { seq: 'asc' } },
                queue: { columns: { playerName: true, connectionId: true }, orderBy: { seq: 'asc' } },
                tokens: { columns: { playerName: true, tokenHash: true } },
            },
        }));

        return row === undefined ? null : RoomRepository.toRoom(row);
    }

    /**
     * The most recent rooms of the game which did not expire at `now`, the last created first: their host connected, or
     * the room waiting for it
     */
    public async findRecentRooms(game: RoomGame, now: number, maxRooms: number): Promise<ListedRoom[]> {
        const rows: ListedRoomRow[] = await this.run(DatabaseOperationEnum.QUERY, (): Promise<ListedRoomRow[]> => this.db.select(RoomRepository.LISTED_ROOM).from(rooms)
            .where(and(eq(rooms.game, game), notExpired(now)))
            .orderBy(desc(rooms.createdAt))
            .limit(maxRooms));

        return rows.map((row: ListedRoomRow): ListedRoom => RoomRepository.toListedRoom(row));
    }

    /**
     * The rooms of the game not expired at `now` whose name holds the search, whatever the case: the names starting with
     * it first, then by name, the name equal to the search first
     * @param search the search key (search.helper) of a part of the name
     */
    public async findRoomsContaining(game: RoomGame, search: string, now: number, maxRooms: number): Promise<ListedRoom[]> {
        const rows: ListedRoomRow[] = await this.run(DatabaseOperationEnum.QUERY, (): Promise<ListedRoomRow[]> => this.db.select(RoomRepository.LISTED_ROOM).from(rooms)
            .where(and(eq(rooms.game, game), notExpired(now), like(rooms.nameKey, `%${ escapeLike(search) }%`)))
            // The names starting with the search first (false before true), then in the order of their characters: the
            // same on PGlite and on the cluster whatever their locale
            .orderBy(sql`strpos(${ rooms.nameKey }, ${ search }) <> 1`, sql`${ rooms.nameKey } COLLATE "C"`)
            .limit(maxRooms));

        return rows.map((row: ListedRoomRow): ListedRoom => RoomRepository.toListedRoom(row));
    }

    /**
     * The highest tag of the rooms of the name, expired or not, the name holding no tag separator: undefined when no room
     * has that name
     */
    public async findLastTag(name: string): Promise<number | undefined> {
        const rows: { id: string }[] = await this.run(DatabaseOperationEnum.QUERY, (): Promise<{ id: string }[]> => this.db.select({ id: rooms.id }).from(rooms)
            // The name, the separator and a tag of all its digits: the order of the ids is then the order of their tags
            .where(like(rooms.id, `${ escapeLike(name) }${ ROOM_TAG_SEPARATOR }${ '_'.repeat(ROOM_TAG_DIGITS) }`))
            .orderBy(sql`${ rooms.id } COLLATE "C" DESC`)
            .limit(1));

        return rows.length === 0 ? undefined : Number(rows[0].id.slice(-ROOM_TAG_DIGITS));
    }

    /**
     * Creates the room with its players and their tokens, replacing an expired room of the same id: a room waiting for its
     * host keeps its id. Deletes the rooms expired at `now` with their rows, the one of that id included: no scheduled
     * cleanup wakes the paused cluster
     * @returns false when a room of that id exists at `now`: nothing created
     */
    public async create(room: Room, now: number): Promise<boolean> {
        return this.run(DatabaseOperationEnum.PUT, (): Promise<boolean> => this.db.transaction(async (tx: DatabaseTransaction): Promise<boolean> => {
            await tx.delete(rooms).where(lte(ROOM_EXPIRY, now));

            const created: { id: string }[] = await tx.insert(rooms).values({
                id: room.id,
                connectionId: room.connectionId,
                hostPlayer: room.hostPlayer,
                maxPlayer: room.maxPlayer,
                game: room.game,
                createdAt: room.createdAt,
                nameKey: room.nameKey,
                passwordHash: room.passwordHash,
                leaseUntil: room.leaseUntil,
            }).onConflictDoNothing().returning({ id: rooms.id });

            if (!RoomRepository.written(created)) {
                return false;
            }

            await tx.insert(roomPlayers).values(room.players.map(({ playerName }: Player): typeof roomPlayers.$inferInsert => ({ roomId: room.id, playerName })));
            await tx.insert(roomTokens).values(Object.entries(room.tokenHashes)
                .map(([playerName, tokenHash]: [string, string]): typeof roomTokens.$inferInsert => ({ roomId: room.id, playerName, tokenHash })));
            return true;
        }));
    }

    /** Lets the room wait until `expiresAt` for its host, unless the host already reconnected it to another connection */
    public async waitForHost(room: Room, hostConnectionId: string, expiresAt: number): Promise<void> {
        await this.run(DatabaseOperationEnum.UPDATE, (): Promise<unknown> => this.db.update(rooms).set({ expiresAt })
            .where(and(eq(rooms.id, room.id), eq(rooms.connectionId, hostConnectionId))));
    }

    /**
     * Moves the room to a connection of the player, which becomes its host: the host, or another player while the room
     * waits for its host. The room no longer waits for its host, its lease renewed until `leaseUntil`
     * @returns false when the token hash is not the one of the player (another room took its name), the room expired at
     * `now`, or the player is not the host while the host is connected
     */
    public async reconnectHost(room: Room, connectionId: string, playerName: string, tokenHash: string, now: number, leaseUntil: number): Promise<boolean> {
        const tokenOfPlayer = this.db.select({ one: sql`1` }).from(roomTokens).where(and(
            eq(roomTokens.roomId, rooms.id),
            eq(roomTokens.playerName, playerName),
            eq(roomTokens.tokenHash, tokenHash),
        ));
        const reconnected: { id: string }[] = await this.run(DatabaseOperationEnum.UPDATE, (): Promise<{ id: string }[]> => this.db.update(rooms)
            .set({ connectionId, hostPlayer: playerName, expiresAt: null, leaseUntil })
            .where(and(
                eq(rooms.id, room.id),
                notExpired(now),
                or(eq(rooms.hostPlayer, playerName), isNotNull(rooms.expiresAt)),
                exists(tokenOfPlayer),
            ))
            .returning({ id: rooms.id }));

        return RoomRepository.written(reconnected);
    }

    /**
     * Renews until `leaseUntil` the lease of the room the connection hosts, unless the room expired at `now`: the ping of a
     * former connection of the host renews nothing. The room found through the connection, by their primary keys
     */
    public async renewLease(connectionId: string, now: number, leaseUntil: number): Promise<void> {
        const roomOfConnection = this.db.select({ roomName: connections.roomName }).from(connections).where(eq(connections.connectionId, connectionId));
        await this.run(DatabaseOperationEnum.UPDATE, (): Promise<unknown> => this.db.update(rooms).set({ leaseUntil })
            .where(and(inArray(rooms.id, roomOfConnection), eq(rooms.connectionId, connectionId), notExpired(now))));
    }

    /** Once: the player is in the game a single time */
    public async addPlayerToRoom(player: Player, room: Room): Promise<void> {
        await this.run(DatabaseOperationEnum.UPDATE, (): Promise<unknown> => this.db.insert(roomPlayers)
            .values({ roomId: room.id, playerName: player.playerName })
            .onConflictDoNothing());
    }

    /** The hash of its token is kept: the page of the player joins the room again without its password */
    public async removePlayerFromRoom(playerName: string, room: Room): Promise<void> {
        if (!room.players.some((player: Player): boolean => player.playerName === playerName)) {
            throw new BadRequestException('Player not in the room');
        }

        await this.run(DatabaseOperationEnum.UPDATE, (): Promise<unknown> => this.db.delete(roomPlayers)
            .where(and(eq(roomPlayers.roomId, room.id), eq(roomPlayers.playerName, playerName))));
    }

    /**
     * Queues the player, keeping the hash of its token: a single statement, the token written only for the player it
     * queued
     * @returns false when a player of that name is queued already, joining at the same time: nothing written
     */
    public async addPlayerToQueue(player: Required<Player>, tokenHash: string, room: Room): Promise<boolean> {
        const queued = this.db.$with('queued').as(this.db.insert(roomQueue)
            .values({ roomId: room.id, playerName: player.playerName, connectionId: player.connectionId })
            .onConflictDoNothing()
            .returning({ roomId: roomQueue.roomId, playerName: roomQueue.playerName }));

        const tokens: { playerName: string }[] = await this.run(DatabaseOperationEnum.UPDATE, (): Promise<{ playerName: string }[]> => this.db.with(queued)
            .insert(roomTokens)
            .select(this.db.select({ roomId: queued.roomId, playerName: queued.playerName, tokenHash: sql<string>`${ tokenHash }::text`.as('token_hash') }).from(queued))
            .onConflictDoUpdate({ target: [roomTokens.roomId, roomTokens.playerName], set: { tokenHash } })
            .returning({ playerName: roomTokens.playerName }));

        return RoomRepository.written(tokens);
    }

    public async removePlayerFromQueue(connectionId: string, room: Room): Promise<void> {
        if (!room.queue.some((player: Player): boolean => player.connectionId === connectionId)) {
            throw new BadRequestException('Player not in the queue');
        }

        await this.run(DatabaseOperationEnum.UPDATE, (): Promise<unknown> => this.db.delete(roomQueue)
            .where(and(eq(roomQueue.roomId, room.id), eq(roomQueue.connectionId, connectionId))));
    }
}
