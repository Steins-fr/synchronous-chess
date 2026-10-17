import { roomPasswordAttempts } from '@database/schema';
import { DatabaseOperationEnum } from '@exceptions/database-exception';
import Room from '@models/room';
import { and, eq, gt, lt, lte, or, SQL, sql } from 'drizzle-orm';
import BaseRepository from './base-repository';

/**
 * The passwords the clients give the private rooms, apart from the rooms: a room read by every request does not grow
 * with the clients trying its password. Deleted with their room, a room created again under its name starts without them
 */
export default class PasswordAttemptRepository extends BaseRepository {
    /**
     * Counts an attempt of the client at the password of the room, unless it made `maxAttempts` before: one statement,
     * so that the attempts sent at once are counted all, before any password is checked. Each attempt counted pushes
     * the end of the count back to `expiresAt`, an attempt after its end counted again from one
     * @param sourceHash the hash of the IP of the client
     * @returns false when the client made `maxAttempts` attempts, the count not over at `now`: this one is not counted
     */
    public async countAttempt(room: Pick<Room, 'id'>, sourceHash: string, maxAttempts: number, now: number, expiresAt: number): Promise<boolean> {
        const countOver: SQL = lte(roomPasswordAttempts.expiresAt, now);
        const counted: { attempts: number }[] = await this.run(DatabaseOperationEnum.UPDATE, (): Promise<{ attempts: number }[]> => this.db.insert(roomPasswordAttempts)
            .values({ roomId: room.id, sourceHash, attempts: 1, expiresAt })
            .onConflictDoUpdate({
                target: [roomPasswordAttempts.roomId, roomPasswordAttempts.sourceHash],
                set: { attempts: sql`CASE WHEN ${ countOver } THEN 1 ELSE ${ roomPasswordAttempts.attempts } + 1 END`, expiresAt },
                setWhere: or(countOver, lt(roomPasswordAttempts.attempts, maxAttempts)),
            })
            .returning({ attempts: roomPasswordAttempts.attempts }));

        return PasswordAttemptRepository.written(counted);
    }

    /**
     * The right password of a client given: its own attempt is not counted. The others stay, a client guessing the
     * password from the same IP as a player of the room keeps its count
     */
    public async uncountAttempt(room: Pick<Room, 'id'>, sourceHash: string): Promise<void> {
        await this.run(DatabaseOperationEnum.UPDATE, (): Promise<unknown> => this.db.update(roomPasswordAttempts)
            .set({ attempts: sql`${ roomPasswordAttempts.attempts } - 1` })
            .where(and(eq(roomPasswordAttempts.roomId, room.id), eq(roomPasswordAttempts.sourceHash, sourceHash), gt(roomPasswordAttempts.attempts, 0))));
    }
}
