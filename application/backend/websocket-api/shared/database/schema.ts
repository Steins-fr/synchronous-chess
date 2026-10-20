/**
 * The tables of the database (PostgreSQL: Aurora on AWS, PGlite in the local API and the specs). `drizzle-kit generate`
 * writes their migrations to the drizzle folder: never edit a table without its migration (checked by the CI)
 */
import { sql } from 'drizzle-orm';
import {
    AnyPgColumn,
    bigint,
    boolean,
    check,
    ExtraConfigColumn,
    index,
    PgTableExtraConfigValue,
    primaryKey,
    smallint,
    snakeCase,
    text,
} from 'drizzle-orm/pg-core';
import { RoomGame } from '@protocol/room-game.enum';

const ROOM_GAMES = Object.values(RoomGame) as [RoomGame, ...RoomGame[]];

/** The columns the constraints and the indexes of a table read */
type ConstrainedColumns<Name extends string> = Record<Name, ExtraConfigColumn>;

/** The list of the games in SQL, for the constraint of the column */
const ROOM_GAMES_SQL: string = ROOM_GAMES.map((game: RoomGame): string => `'${ game }'`).join(', ');

export const rooms = snakeCase.table('rooms', {
    /** The name of the room */
    id: text().primaryKey(),
    /** The connection of its host */
    connectionId: text().notNull(),
    hostPlayer: text().notNull(),
    maxPlayer: smallint().notNull(),
    game: text({ enum: ROOM_GAMES }).notNull(),
    /** An ISO 8601 date in UTC: its order as a text is its order in time */
    createdAt: text().notNull(),
    /** The search key of its name (search.helper) */
    nameKey: text().notNull(),
    /** Set for a private room: the hash of its password (password.helper) */
    passwordHash: text(),
    isPrivate: boolean().notNull().generatedAlwaysAs(sql`password_hash IS NOT NULL`),
    /** Set while its host is disconnected, in epoch seconds: the room waits until then for the host to reconnect */
    expiresAt: bigint({ mode: 'number' }),
    /**
     * In epoch seconds, while its host is connected: the room no longer exists after it, unless a ping of its host
     * renews it (RoomService.LEASE)
     */
    leaseUntil: bigint({ mode: 'number' }).notNull(),
}, (table: ConstrainedColumns<'maxPlayer' | 'game' | 'createdAt' | 'nameKey' | 'expiresAt' | 'leaseUntil'>): PgTableExtraConfigValue[] => [
    check('rooms_max_player', sql`${table.maxPlayer} BETWEEN 1 AND 16`),
    check('rooms_game', sql`${table.game} IN (${sql.raw(ROOM_GAMES_SQL)})`),
    // The most recent rooms of a game. Nulls first, the order of `ORDER BY created_at DESC`: else not read in order
    index('rooms_game_created_at').on(table.game, table.createdAt.desc().nullsFirst()),
    // The rooms whose name holds the search: pg_trgm, created by the first migration
    index('rooms_name_key_trgm').using('gin', table.nameKey.op('gin_trgm_ops')),
    // The expired rooms, deleted on the creation of a room: the end of the wait for the host, else of the lease (the
    // expiry of RoomRepository)
    index('rooms_expiry').on(sql`coalesce(${table.expiresAt}, ${table.leaseUntil})`),
]);

/** The room of the rows of the tables below, which are deleted with it */
function roomId(): AnyPgColumn {
    return rooms.id;
}

/** The players in the game of a room, in the order they joined it */
export const roomPlayers = snakeCase.table('room_players', {
    roomId: text().notNull().references(roomId, { onDelete: 'cascade' }),
    playerName: text().notNull(),
    seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
}, (table: ConstrainedColumns<'roomId' | 'playerName'>): PgTableExtraConfigValue[] => [primaryKey({ columns: [table.roomId, table.playerName] })]);

/**
 * The players waiting to join a room, in the order they asked, by their connection: a player the host added to the
 * game stays queued until its connection closes
 */
export const roomQueue = snakeCase.table('room_queue', {
    roomId: text().notNull().references(roomId, { onDelete: 'cascade' }),
    playerName: text().notNull(),
    connectionId: text().notNull(),
    seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
}, (table: ConstrainedColumns<'roomId' | 'playerName' | 'connectionId'>): PgTableExtraConfigValue[] => [
    primaryKey({ columns: [table.roomId, table.playerName] }),
    index('room_queue_connection').on(table.roomId, table.connectionId),
]);

/**
 * SHA-256 of the token of each player who joined a room, kept once it left: the host reconnects the room with its own,
 * the page of a player joins a private room again without its password
 */
export const roomTokens = snakeCase.table('room_tokens', {
    roomId: text().notNull().references(roomId, { onDelete: 'cascade' }),
    playerName: text().notNull(),
    tokenHash: text().notNull(),
}, (table: ConstrainedColumns<'roomId' | 'playerName'>): PgTableExtraConfigValue[] => [primaryKey({ columns: [table.roomId, table.playerName] })]);

/**
 * The passwords a client gave a private room in a row (PasswordAttemptRepository): deleted with the room, a room
 * created again under its name starts without them
 */
export const roomPasswordAttempts = snakeCase.table('room_password_attempts', {
    roomId: text().notNull().references(roomId, { onDelete: 'cascade' }),
    /** The hash of the IP of the client (source.helper) */
    sourceHash: text().notNull(),
    attempts: smallint().notNull(),
    /** In epoch seconds, pushed back by each attempt counted: the count starts again then */
    expiresAt: bigint({ mode: 'number' }).notNull(),
}, (table: ConstrainedColumns<'roomId' | 'sourceHash'>): PgTableExtraConfigValue[] => [primaryKey({ columns: [table.roomId, table.sourceHash] })]);

/**
 * The room of each connection: no foreign key, the connection is written before the room it creates, and names the
 * room a failed creation did not create
 */
export const connections = snakeCase.table('connections', {
    connectionId: text().primaryKey(),
    roomName: text().notNull(),
});
