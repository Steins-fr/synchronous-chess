import BadRequestException from '@exceptions/bad-request-exception';
import { isPassword, verifyPassword } from '@helpers/password.helper';
import { hashSource } from '@helpers/source.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { ROOM_PASSWORD_LOCK_DELAY } from '@protocol/room-limits';
import PasswordAttemptRepository from '@repositories/password-attempt-repository';

/**
 * The passwords of the private rooms, apart from RoomService: only the lambda joining the rooms reads the table of the
 * attempts, the others are not given its name
 */
export default class RoomPasswordService {
    /** The passwords in a row a private room checks of a client, before refusing its passwords for ROOM_PASSWORD_LOCK_DELAY */
    public static readonly MAX_PASSWORD_ATTEMPTS: number = 5;

    private readonly passwordAttemptRepository: PasswordAttemptRepository = new PasswordAttemptRepository();

    /**
     * Before a player joins a private room: a public room ignores the password, and so does a private one for a player
     * of the room, its token proving it gave the password before (a page reloaded or joining again). A client gives
     * MAX_PASSWORD_ATTEMPTS passwords in a row at most, each one counted before being checked, then the room refuses its
     * passwords without checking them, for this client only, until ROOM_PASSWORD_LOCK_DELAY after the last one counted:
     * a password is not guessed by trying them all, even all at once, and the other clients still join the room. The
     * right password is not counted once checked, nor a missing or invalid one, never the right one: a player joining a
     * room listed as public before it became private does not lose an attempt
     * @param sourceIp the IP of the client, or its connection without it
     * @throws {BadRequestException} when the client gave too many passwords (TOO_MANY_PASSWORD_ATTEMPTS), or the
     * password is not the one of the private room (WRONG_PASSWORD)
     */
    public async passwordGuard(room: Room, request: Pick<RoomJoinRequest, 'playerName' | 'password' | 'token'>, sourceIp: string): Promise<void> {
        if (room.passwordHash === undefined || room.tokenHashes[request.playerName] === hashToken(request.token)) {
            return;
        }

        if (!isPassword(request.password)) {
            throw new BadRequestException(RoomApiErrorMessage.WRONG_PASSWORD);
        }

        // In epoch seconds, the unit of the TTL of DynamoDB
        const now: number = Math.floor(Date.now() / 1000);
        const source: string = hashSource(sourceIp);

        if (!await this.passwordAttemptRepository.countAttempt(room, source, RoomPasswordService.MAX_PASSWORD_ATTEMPTS, now, now + ROOM_PASSWORD_LOCK_DELAY)) {
            throw new BadRequestException(RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
        }

        if (!verifyPassword(request.password, room.passwordHash)) {
            throw new BadRequestException(RoomApiErrorMessage.WRONG_PASSWORD);
        }

        await this.passwordAttemptRepository.uncountAttempt(room, source);
    }
}
