import { DatabaseTransaction } from '@database/database';
import { roomPlayers, roomQueue, rooms, roomTokens } from '@database/schema';
import BadRequestException from '@exceptions/bad-request-exception';
import { DatabaseOperationEnum } from '@exceptions/database-exception';
import { escapeLike } from '@helpers/search.helper';
import Player from '@models/player';
import Room from '@models/room';
import { RoomGame } from '@protocol/room-game.enum';
import { and, desc, eq, exists, gt, isNotNull, isNull, like, lte, or, SQL, sql } from 'drizzle-orm';
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

/** A room not expired at `now`: its host connected, or the room waiting for it */
function notExpired(now: number): SQL | undefined {
    return or(isNull(rooms.expiresAt), gt(rooms.expiresAt, now));
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
     * Creates the room with its players and their tokens, replacing an expired room of the same name: a room waiting for
     * its host keeps its name. Deletes the rooms expired at `now` with their rows, the one of that name included: no
     * scheduled cleanup wakes the paused cluster
     * @returns false when a room of that name exists at `now`: nothing created
     */
    public async create(room: Room, now: number): Promise<boolean> {
        return this.run(DatabaseOperationEnum.PUT, (): Promise<boolean> => this.db.transaction(async (tx: DatabaseTransaction): Promise<boolean> => {
            await tx.delete(rooms).where(lte(rooms.expiresAt, now));

            const created: { id: string }[] = await tx.insert(rooms).values({
                id: room.id,
                connectionId: room.connectionId,
                hostPlayer: room.hostPlayer,
                maxPlayer: room.maxPlayer,
                game: room.game,
                createdAt: room.createdAt,
                nameKey: room.nameKey,
                passwordHash: room.passwordHash,
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
     * waits for its host. The room no longer waits for its host
     * @returns false when the token hash is not the one of the player (another room took its name), the room expired at
     * `now`, or the player is not the host while the host is connected
     */
    public async reconnectHost(room: Room, connectionId: string, playerName: string, tokenHash: string, now: number): Promise<boolean> {
        const tokenOfPlayer = this.db.select({ one: sql`1` }).from(roomTokens).where(and(
            eq(roomTokens.roomId, rooms.id),
            eq(roomTokens.playerName, playerName),
            eq(roomTokens.tokenHash, tokenHash),
        ));
        const reconnected: { id: string }[] = await this.run(DatabaseOperationEnum.UPDATE, (): Promise<{ id: string }[]> => this.db.update(rooms)
            .set({ connectionId, hostPlayer: playerName, expiresAt: null })
            .where(and(
                eq(rooms.id, room.id),
                notExpired(now),
                or(eq(rooms.hostPlayer, playerName), isNotNull(rooms.expiresAt)),
                exists(tokenOfPlayer),
            ))
            .returning({ id: rooms.id }));

        return RoomRepository.written(reconnected);
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
