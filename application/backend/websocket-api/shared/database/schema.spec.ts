import { useTestDatabase } from '@testing/database';
import { RoomGame } from '@protocol/room-game.enum';
import { asc, eq, getTableName, sql } from 'drizzle-orm';
import { ForeignKey, getTableConfig, Index, PgColumn, PgTable, PrimaryKey } from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'vitest';
import { connections, roomPasswordAttempts, roomPlayers, roomQueue, rooms, roomTokens } from './schema';

type NewRoom = typeof rooms.$inferInsert;

function aRoom(room: Partial<NewRoom> = {}): NewRoom {
    return {
        id: 'room',
        connectionId: 'host-connection',
        hostPlayer: 'host',
        maxPlayer: 2,
        game: RoomGame.CHESS,
        createdAt: '2026-10-17T12:00:00.000Z',
        nameKey: 'room',
        leaseUntil: 1_800_000_000,
        ...room,
    };
}

// Run on PGlite with the migrations of the drizzle folder, like the cluster
describe('schema', () => {
    const database = useTestDatabase();

    test('should have the extension searching the rooms by a part of their name', async () => {
        // When
        const extensions = await database.db.execute<{ extname: string }>(sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`);

        // Then
        expect(extensions.rows).toEqual([{ extname: 'pg_trgm' }]);
    });

    test.each([
        ['without password', undefined, false],
        ['with a password', 'hash', true],
    ])('should tell whether a room %s is private', async (_case: string, passwordHash: string | undefined, isPrivate: boolean) => {
        // Given
        await database.db.insert(rooms).values(aRoom({ passwordHash }));

        // When
        const [room] = await database.db.select({ isPrivate: rooms.isPrivate }).from(rooms);

        // Then
        expect(room).toEqual({ isPrivate });
    });

    test.each([
        ['no player', { maxPlayer: 0 }],
        ['more than 16 players', { maxPlayer: 17 }],
        ['an unknown game', { game: 'go' as RoomGame }],
    ])('should refuse a room of %s', async (_case: string, room: Partial<NewRoom>) => {
        await expect(database.db.insert(rooms).values(aRoom(room))).rejects.toThrow();
    });

    test('should keep the players in the order they joined', async () => {
        // Given
        await database.db.insert(rooms).values(aRoom());
        await database.db.insert(roomPlayers).values([{ roomId: 'room', playerName: 'zoe' }, { roomId: 'room', playerName: 'alice' }]);

        // When
        const players = await database.db.select({ playerName: roomPlayers.playerName }).from(roomPlayers).orderBy(asc(roomPlayers.seq));

        // Then
        expect(players).toEqual([{ playerName: 'zoe' }, { playerName: 'alice' }]);
    });

    test('should delete the players, the queue, the tokens and the password attempts of a room with it', async () => {
        // Given
        await database.db.insert(rooms).values([aRoom(), aRoom({ id: 'other', nameKey: 'other' })]);
        await Promise.all(['room', 'other'].flatMap((roomId: string) => [
            database.db.insert(roomPlayers).values({ roomId, playerName: 'host' }),
            database.db.insert(roomQueue).values({ roomId, playerName: 'guest', connectionId: 'guest-connection' }),
            database.db.insert(roomTokens).values({ roomId, playerName: 'host', tokenHash: 'hash' }),
            database.db.insert(roomPasswordAttempts).values({ roomId, sourceHash: 'source', attempts: 1, expiresAt: 60 }),
        ]));
        await database.db.insert(connections).values({ connectionId: 'host-connection', roomName: 'room' });

        // When
        await database.db.delete(rooms).where(eq(rooms.id, 'room'));

        // Then
        const roomIds = await Promise.all([
            database.db.select({ roomId: roomPlayers.roomId }).from(roomPlayers),
            database.db.select({ roomId: roomQueue.roomId }).from(roomQueue),
            database.db.select({ roomId: roomTokens.roomId }).from(roomTokens),
            database.db.select({ roomId: roomPasswordAttempts.roomId }).from(roomPasswordAttempts),
        ]);
        expect(roomIds).toEqual(Array.from({ length: 4 }, () => [{ roomId: 'other' }]));
        expect(await database.db.select().from(connections)).toEqual([{ connectionId: 'host-connection', roomName: 'room' }]);
    });

    // What drizzle-kit generates the migrations from (`drizzle-kit check` in the CI)
    test('should declare the indexes of the list and the search of the rooms, of their expiry, and their unique search key', () => {
        expect(getTableConfig(rooms).indexes.map((index: Index) => ({ name: index.config.name, unique: index.config.unique }))).toEqual([
            { name: 'rooms_game_created_at', unique: false },
            { name: 'rooms_name_key_trgm', unique: false },
            { name: 'rooms_name_key', unique: true },
            { name: 'rooms_expiry', unique: false },
        ]);
    });

    test.each([
        ['players', roomPlayers, ['room_id', 'player_name']],
        ['queue', roomQueue, ['room_id', 'player_name']],
        ['tokens', roomTokens, ['room_id', 'player_name']],
        ['password attempts', roomPasswordAttempts, ['room_id', 'source_hash']],
    ])('should declare the %s of a room deleted with it, keyed by room', (_rows: string, table: PgTable, primaryKey: string[]) => {
        // When
        const { foreignKeys, primaryKeys } = getTableConfig(table);

        // Then
        expect(foreignKeys.map((foreignKey: ForeignKey) => ({ table: getTableName(foreignKey.reference().foreignTable), onDelete: foreignKey.onDelete })))
            .toEqual([{ table: 'rooms', onDelete: 'cascade' }]);
        expect(primaryKeys.map((key: PrimaryKey) => key.columns.map((column: PgColumn) => column.name))).toEqual([primaryKey]);
    });
});
