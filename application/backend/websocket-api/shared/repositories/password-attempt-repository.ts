import PasswordAttempt from '@models/password-attempt';
import { getPasswordAttemptsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

/**
 * The passwords the clients give the private rooms, apart from the rooms: a room read by every request does not grow
 * with the clients trying its password, and the TTL of the table deletes their counts
 */
export default class PasswordAttemptRepository extends BaseRepository<PasswordAttempt> {
    protected readonly tableName: string = getPasswordAttemptsTableName();
    protected readonly defaultProjection: string = 'roomName, source, attempts, expiresAt';

    protected override getKey(item: Partial<PasswordAttempt>): DocumentAttributes {
        return { roomName: item.roomName, source: item.source };
    }

    /**
     * Counts an attempt of the client at the password of the room, unless it made `maxAttempts` before: atomic, so that
     * the attempts sent at once are counted all, before any password is checked. Each attempt counted pushes the end of
     * the count back to `expiresAt`, an attempt after its end counted again from one
     * @param source the hash of the IP of the client
     * @returns false when the client made `maxAttempts` attempts, the count not over at `now`: this one is not counted
     */
    public async countAttempt(roomName: string, source: string, maxAttempts: number, now: number, expiresAt: number): Promise<boolean> {
        const key: Partial<PasswordAttempt> = { roomName, source };

        return await this.updateItemIf(key, 'SET attempts = if_not_exists(attempts, :zero) + :one, expiresAt = :expiresAt', {
            expression: 'attribute_not_exists(attempts) OR (attempts < :maxAttempts AND expiresAt > :now)',
            attributeValues: { ':maxAttempts': maxAttempts, ':now': now },
        }, { ':zero': 0, ':one': 1, ':expiresAt': expiresAt })
            || await this.updateItemIf(key, 'SET attempts = :one, expiresAt = :expiresAt', {
                expression: 'expiresAt <= :now',
                attributeValues: { ':now': now },
            }, { ':one': 1, ':expiresAt': expiresAt });
    }

    /** The right password of a client given: its attempts before are forgotten */
    public async forgetAttempts(roomName: string, source: string): Promise<void> {
        await this.delete({ roomName, source });
    }
}
