/**
 * The smoke test of the Data API, run by data-api-smoke.sh (`npm run smoke:data-api -- <stage>`) against the Aurora
 * cluster of the environment (DATABASE_RESOURCE_ARN, DATABASE_SECRET_ARN, DATABASE_NAME): the statements the
 * repositories send, run by Drizzle on the cluster, in a database of their own, dropped at the end. It checks what the
 * specs on PGlite cannot: the codecs of the Data API, and the concurrency of a real cluster.
 * - `npx tsx local/data-api-smoke.ts` runs the statements
 * - `npx tsx local/data-api-smoke.ts resume` times a statement sent to the paused cluster
 */
import { createDataApiDatabase, DataApiDatabase } from '@database/data-api-database';
import { relations } from '@database/relations';
import { retryOnResume } from '@database/resume-retry';
import { connections, roomPasswordAttempts, roomPlayers, roomQueue, rooms, roomTokens } from '@database/schema';
import { RoomGame } from '@protocol/room-game.enum';
import { and, desc, eq, exists, gt, inArray, isNotNull, like, lt, lte, or, SQL, sql } from 'drizzle-orm';
import { AwsDataApiPgQueryResultHKT } from 'drizzle-orm/aws-data-api/pg';
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
import { PgAsyncTransaction } from 'drizzle-orm/pg-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const SMOKE_DATABASE: string = 'smoke';
const NOW: number = 1_800_000_000;
const LEASED_UNTIL: number = NOW + 1200;

async function timed<Result>(step: string, run: () => Promise<Result>): Promise<Result> {
    const start: number = performance.now();
    const result: Result = await run();
    console.log(`${ step }: ${ Math.round(performance.now() - start) } ms`);
    return result;
}

/** RoomRepository: the wait for the host once disconnected, else the lease */
const ROOM_EXPIRY: SQL<number> = sql<number>`coalesce(${ rooms.expiresAt }, ${ rooms.leaseUntil })`;

function notExpired(now: number): SQL {
    return gt(ROOM_EXPIRY, now);
}

/** RoomRepository.create: the expired room of the same name deleted first, with its rows */
function createRoom(db: DataApiDatabase, id: string, passwordHash?: string): Promise<boolean> {
    return db.transaction(async (tx: PgAsyncTransaction<AwsDataApiPgQueryResultHKT, typeof relations>): Promise<boolean> => {
        await tx.delete(rooms).where(and(eq(rooms.id, id), lte(ROOM_EXPIRY, NOW)));
        const created: { id: string }[] = await tx.insert(rooms).values({
            id,
            connectionId: `${ id }-host`,
            hostPlayer: 'host',
            maxPlayer: 2,
            game: RoomGame.CHESS,
            createdAt: new Date((NOW + id.length) * 1000).toISOString(),
            nameKey: id.toLowerCase(),
            passwordHash,
            leaseUntil: LEASED_UNTIL,
        }).onConflictDoNothing().returning({ id: rooms.id });

        if (created.length === 0) {
            return false;
        }

        await tx.insert(roomPlayers).values({ roomId: id, playerName: 'host' });
        await tx.insert(roomTokens).values({ roomId: id, playerName: 'host', tokenHash: 'host-token', browserHash: 'host-browser' });
        return true;
    });
}

/** PasswordAttemptRepository.countAttempt: 5 attempts at most until the count ends */
async function countAttempt(db: DataApiDatabase, now: number): Promise<boolean> {
    const counted: { attempts: number }[] = await db.insert(roomPasswordAttempts)
        .values({ roomId: 'Private', sourceHash: 'source', attempts: 1, expiresAt: now + 60 })
        .onConflictDoUpdate({
            target: [roomPasswordAttempts.roomId, roomPasswordAttempts.sourceHash],
            set: {
                attempts: sql`CASE WHEN ${ lte(roomPasswordAttempts.expiresAt, now) } THEN 1 ELSE ${ roomPasswordAttempts.attempts } + 1 END`,
                expiresAt: now + 60,
            },
            setWhere: or(lte(roomPasswordAttempts.expiresAt, now), lt(roomPasswordAttempts.attempts, 5)),
        })
        .returning({ attempts: roomPasswordAttempts.attempts });
    return counted.length > 0;
}

function reconnectHost(db: DataApiDatabase, playerName: string, tokenHash: string): Promise<{ id: string }[]> {
    return db.update(rooms).set({ connectionId: 'Room-host-2', hostPlayer: playerName, expiresAt: null, leaseUntil: LEASED_UNTIL })
        .where(and(
            eq(rooms.id, 'Room'),
            notExpired(NOW),
            or(eq(rooms.hostPlayer, playerName), isNotNull(rooms.expiresAt)),
            exists(db.select({ one: sql`1` }).from(roomTokens).where(and(
                eq(roomTokens.roomId, rooms.id),
                eq(roomTokens.playerName, playerName),
                eq(roomTokens.tokenHash, tokenHash),
            ))),
        ))
        .returning({ id: rooms.id });
}

async function runStatements(db: DataApiDatabase): Promise<void> {
    await timed('migrations', (): Promise<unknown> => migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') }));

    assert.equal(await timed('create a room', (): Promise<boolean> => createRoom(db, 'Room')), true);
    assert.equal(await createRoom(db, 'Room'), false, 'a room of the same name exists');
    assert.equal(await createRoom(db, 'Private', 'password-hash'), true);
    await db.update(rooms).set({ expiresAt: NOW - 1 }).where(eq(rooms.id, 'Room'));
    assert.equal(await createRoom(db, 'Room'), true, 'the room of the same name expired');

    // RoomRepository.addPlayerToQueue, in one statement, then addPlayerToRoom
    const queued = db.$with('queued').as(db.insert(roomQueue).values({ roomId: 'Room', playerName: 'guest', connectionId: 'guest-connection' }).onConflictDoNothing());
    await timed('queue a player', (): Promise<unknown> => db.with(queued).insert(roomTokens)
        .values({ roomId: 'Room', playerName: 'guest', tokenHash: 'guest-token', browserHash: 'guest-browser' })
        .onConflictDoUpdate({ target: [roomTokens.roomId, roomTokens.playerName], set: { tokenHash: 'guest-token', browserHash: 'guest-browser' } }).execute());
    await db.insert(roomPlayers).values({ roomId: 'Room', playerName: 'guest' }).onConflictDoNothing();

    // RoomRepository.getByName: what each signal relayed reads
    const getByName = (): Promise<unknown> => db.query.rooms.findFirst({
        where: { id: 'Room' },
        with: {
            players: { columns: { playerName: true }, orderBy: { seq: 'asc' } },
            queue: { columns: { playerName: true, connectionId: true }, orderBy: { seq: 'asc' } },
            tokens: { columns: { playerName: true, tokenHash: true }, orderBy: { playerName: 'asc' } },
        },
    });
    assert.deepEqual(await timed('read a room with its players', getByName), {
        id: 'Room',
        connectionId: 'Room-host',
        hostPlayer: 'host',
        maxPlayer: 2,
        game: RoomGame.CHESS,
        createdAt: new Date((NOW + 4) * 1000).toISOString(),
        nameKey: 'room',
        passwordHash: null,
        isPrivate: false,
        expiresAt: null,
        leaseUntil: LEASED_UNTIL,
        players: [{ playerName: 'host' }, { playerName: 'guest' }],
        queue: [{ playerName: 'guest', connectionId: 'guest-connection' }],
        tokens: [{ playerName: 'guest', tokenHash: 'guest-token' }, { playerName: 'host', tokenHash: 'host-token' }],
    });
    const durations: number[] = [];
    for (let read: number = 0; read < 10; read++) {
        const start: number = performance.now();
        // eslint-disable-next-line no-await-in-loop -- timed one after the other
        await getByName();
        durations.push(performance.now() - start);
    }
    durations.sort((a: number, b: number): number => a - b);
    console.log(`read a room, median of 10: ${ Math.round(durations[5] ?? 0) } ms`);

    // RoomRepository.findRecentRooms and findRoomsContaining
    const listed = {
        id: rooms.id,
        hostPlayer: rooms.hostPlayer,
        maxPlayer: rooms.maxPlayer,
        isPrivate: rooms.isPrivate,
        expiresAt: rooms.expiresAt,
        playerCount: sql<number>`(SELECT count(*)::int FROM ${ roomPlayers } WHERE ${ roomPlayers.roomId } = ${ rooms.id })`,
    };
    assert.deepEqual(await timed('list the recent rooms', (): Promise<unknown> => db.select(listed).from(rooms)
        .where(and(eq(rooms.game, RoomGame.CHESS), notExpired(NOW))).orderBy(desc(rooms.createdAt)).limit(31)), [
        { id: 'Private', hostPlayer: 'host', maxPlayer: 2, isPrivate: true, expiresAt: null, playerCount: 1 },
        { id: 'Room', hostPlayer: 'host', maxPlayer: 2, isPrivate: false, expiresAt: null, playerCount: 2 },
    ]);
    const search: string = 'r';
    assert.deepEqual(await timed('search the rooms', (): Promise<unknown> => db.select({ id: rooms.id }).from(rooms)
        .where(and(eq(rooms.game, RoomGame.CHESS), notExpired(NOW), like(rooms.nameKey, `%${ search }%`), like(sql`split_part(${ rooms.nameKey }, '#', 1)`, `%${ search }%`)))
        .orderBy(sql`strpos(${ rooms.nameKey }, ${ search })`, sql`split_part(${ rooms.nameKey }, '#', 1) COLLATE "C"`, sql`${ rooms.nameKey } COLLATE "C"`).limit(31)), [
        { id: 'Room' },
        { id: 'Private' },
    ]);

    // RoomRepository.findLastTag and findFirstFreeTag: the rooms of a name, through the trigram index of their search key
    for (const id of ['Tag#000000', 'Tag#000001', 'Tag#999999']) {
        // eslint-disable-next-line no-await-in-loop -- created one after the other
        await createRoom(db, id);
    }
    const ofName: SQL = and(like(rooms.nameKey, 'tag#______'), notExpired(NOW)) as SQL;
    assert.deepEqual(await timed('find the last tag of a name', (): Promise<unknown> => db.select({ nameKey: rooms.nameKey }).from(rooms)
        .where(ofName).orderBy(sql`${ rooms.nameKey } COLLATE "C" DESC`).limit(1)), [{ nameKey: 'tag#999999' }]);
    const tag: SQL<number> = sql<number>`right(${ rooms.nameKey }, 6)::int`;
    const tags = db.$with('tags').as(db.select({
        tag: tag.as('tag'),
        previous: sql<number | null>`lag(${ tag }) OVER (ORDER BY ${ tag })`.as('previous'),
        next: sql<number | null>`lead(${ tag }) OVER (ORDER BY ${ tag })`.as('next'),
    }).from(rooms).where(ofName));
    const free: SQL<number> = sql<number>`CASE
        WHEN ${ tags.previous } IS NULL AND ${ tags.tag } > 0 THEN 0
        WHEN ${ tags.tag } < ${ 999_999 } AND (${ tags.next } IS NULL OR ${ tags.next } > ${ tags.tag } + 1) THEN ${ tags.tag } + 1
    END`;
    assert.deepEqual(await timed('find the first tag free of a name', (): Promise<unknown> => db.with(tags).select({ free }).from(tags)
        .where(isNotNull(free)).orderBy(free).limit(1)), [{ free: 2 }]);
    // RoomRepository.create: no room of the id of a room of another case (rooms_name_key)
    assert.equal(await createRoom(db, 'TAG#000000'), false, 'the id of another case');
    await db.delete(rooms).where(like(rooms.id, 'Tag#%'));

    // RoomRepository.banPlayer, then isBanned: by the name, or by the browser
    await timed('ban a player', (): Promise<unknown> => db.update(roomTokens).set({ banned: true })
        .where(and(eq(roomTokens.roomId, 'Room'), eq(roomTokens.playerName, 'guest'))));
    const isBanned = (playerName: string, browserHash: string): Promise<unknown[]> => db.select({ one: sql`1` }).from(roomTokens)
        .where(and(eq(roomTokens.roomId, 'Room'), eq(roomTokens.banned, true), or(eq(roomTokens.playerName, playerName), eq(roomTokens.browserHash, browserHash))))
        .limit(1);
    assert.equal((await timed('tell a player banned', (): Promise<unknown[]> => isBanned('guest', 'other-browser'))).length, 1, 'banned by its name');
    assert.equal((await isBanned('other', 'guest-browser')).length, 1, 'banned by its browser');
    assert.equal((await isBanned('other', 'host-browser')).length, 0, 'not banned');

    // RoomRepository.reconnectHost
    assert.equal((await reconnectHost(db, 'host', 'wrong-token')).length, 0, 'a wrong token');
    assert.equal((await reconnectHost(db, 'guest', 'guest-token')).length, 0, 'a guest while the host is connected');
    assert.equal((await timed('reconnect the host', (): Promise<{ id: string }[]> => reconnectHost(db, 'host', 'host-token'))).length, 1);

    // PasswordAttemptRepository: the attempts sent at once, all counted before any password is checked
    const counted: boolean[] = await timed('count 8 attempts at once', (): Promise<boolean[]> => Promise.all(Array.from({ length: 8 }, (): Promise<boolean> => countAttempt(db, NOW))));
    assert.equal(counted.filter(Boolean).length, 5, `5 attempts counted out of 8: ${ counted.join(', ') }`);
    assert.equal(await countAttempt(db, NOW + 61), true, 'counted again once the count ended');
    await db.update(roomPasswordAttempts).set({ attempts: sql`${ roomPasswordAttempts.attempts } - 1` })
        .where(and(eq(roomPasswordAttempts.roomId, 'Private'), gt(roomPasswordAttempts.attempts, 0)));
    assert.deepEqual(await db.select().from(roomPasswordAttempts), [{ roomId: 'Private', sourceHash: 'source', attempts: 0, expiresAt: NOW + 121 }]);

    // ConnectionRepository
    await db.insert(connections).values({ connectionId: 'connection', roomName: 'Room' })
        .onConflictDoUpdate({ target: connections.connectionId, set: { roomName: 'Room' } });
    await db.insert(connections).values({ connectionId: 'connection', roomName: 'Private' })
        .onConflictDoUpdate({ target: connections.connectionId, set: { roomName: 'Private' } });
    assert.deepEqual(await db.select().from(connections), [{ connectionId: 'connection', roomName: 'Private' }]);

    // RoomRepository.renewLease: the room found through the connection of its host
    await db.insert(connections).values({ connectionId: 'Room-host-2', roomName: 'Room' });
    const renewed: { leaseUntil: number }[] = await timed('renew the lease of a room', (): Promise<{ leaseUntil: number }[]> => db.update(rooms).set({ leaseUntil: LEASED_UNTIL + 240 })
        .where(and(
            inArray(rooms.id, db.select({ roomName: connections.roomName }).from(connections).where(eq(connections.connectionId, 'Room-host-2'))),
            eq(rooms.connectionId, 'Room-host-2'),
            notExpired(NOW),
        ))
        .returning({ leaseUntil: rooms.leaseUntil }));
    assert.deepEqual(renewed, [{ leaseUntil: LEASED_UNTIL + 240 }]);

    await db.delete(rooms).where(eq(rooms.id, 'Room'));
    assert.deepEqual(await db.select({ roomId: roomTokens.roomId }).from(roomTokens), [{ roomId: 'Private' }], 'the tokens deleted with their room');
}

async function main(): Promise<void> {
    const cluster: DataApiDatabase = createDataApiDatabase();

    if (process.argv[2] === 'resume') {
        await timed('a statement to the paused cluster', (): Promise<unknown> => cluster.execute(sql`SELECT 1`));
        return;
    }

    // A cluster paused for more than a day takes 30 seconds or more to resume: longer than the waits of the lambdas
    await retryOnResume((): Promise<unknown> => cluster.execute(sql`SELECT 1`), [0, 10_000, 10_000]);
    await cluster.execute(sql.raw(`DROP DATABASE IF EXISTS ${ SMOKE_DATABASE } WITH (FORCE)`));
    await cluster.execute(sql.raw(`CREATE DATABASE ${ SMOKE_DATABASE }`));
    process.env.DATABASE_NAME = SMOKE_DATABASE;

    try {
        await runStatements(createDataApiDatabase());
        console.log('The Data API runs the statements of the repositories');
    } finally {
        await cluster.execute(sql.raw(`DROP DATABASE ${ SMOKE_DATABASE } WITH (FORCE)`));
    }
}

await main();
