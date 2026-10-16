import PasswordAttempt from '@models/password-attempt';
import Room from '@models/room';
import { getPasswordAttemptsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

/**
 * The passwords the clients give the private rooms, apart from the rooms: a room read by every request does not grow
 * with the clients trying its password, and the TTL of the table deletes their counts
 */
export default class PasswordAttemptRepository extends BaseRepository<PasswordAttempt> {
    protected readonly tableName: string = getPasswordAttemptsTableName();
    protected readonly defaultProjection: string = 'roomKey, sourceHash, attempts, expiresAt';

    protected override getKey(item: Partial<PasswordAttempt>): DocumentAttributes {
        return { roomKey: item.roomKey, sourceHash: item.sourceHash };
    }

    /**
     * The room by its name and its creation date: a room created again under the name of an expired one starts without
     * the attempts of the former one. The date, of a fixed length, ends the key: two rooms never share one
     */
    private static keyOf(room: Pick<Room, 'id' | 'createdAt'>, sourceHash: string): Partial<PasswordAttempt> {
        return { roomKey: `${ room.id }#${ room.createdAt }`, sourceHash };
    }

    /**
     * Counts an attempt of the client at the password of the room, unless it made `maxAttempts` before: atomic, so that
     * the attempts sent at once are counted all, before any password is checked. Each attempt counted pushes the end of
     * the count back to `expiresAt`, an attempt after its end counted again from one
     * @param sourceHash the hash of the IP of the client
     * @returns false when the client made `maxAttempts` attempts, the count not over at `now`: this one is not counted
     */
    public async countAttempt(room: Pick<Room, 'id' | 'createdAt'>, sourceHash: string, maxAttempts: number, now: number, expiresAt: number): Promise<boolean> {
        const key: Partial<PasswordAttempt> = PasswordAttemptRepository.keyOf(room, sourceHash);
        const count = (): Promise<boolean> => this.updateItemIf(key, 'SET attempts = if_not_exists(attempts, :zero) + :one, expiresAt = :expiresAt', {
            expression: 'attribute_not_exists(attempts) OR (attempts < :maxAttempts AND expiresAt > :now)',
            attributeValues: { ':maxAttempts': maxAttempts, ':now': now },
        }, { ':zero': 0, ':one': 1, ':expiresAt': expiresAt });

        return await count()
            || await this.updateItemIf(key, 'SET attempts = :one, expiresAt = :expiresAt', {
                expression: 'expiresAt <= :now',
                attributeValues: { ':now': now },
            }, { ':one': 1, ':expiresAt': expiresAt })
            // Another attempt counted again from one meanwhile, or the count deleted: this one is counted after it
            || await count();
    }

    /**
     * The right password of a client given: its own attempt is not counted. The others stay, a client guessing the
     * password from the same IP as a player of the room keeps its count
     */
    public async uncountAttempt(room: Pick<Room, 'id' | 'createdAt'>, sourceHash: string): Promise<void> {
        await this.updateItemIf(PasswordAttemptRepository.keyOf(room, sourceHash), 'SET attempts = attempts - :one', {
            expression: 'attempts > :zero',
            attributeValues: { ':zero': 0 },
        }, { ':one': 1 });
    }
}
