import { wait } from '@app/helpers/wait.helper';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { ROOM_PASSWORD_LOCK_DELAY } from '@protocol/room-limits';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { RoomSocketApi } from './room-socket.api';

/**
 * A player reloading the page joins again under its name before the host noticed it left: the websocket API refuses
 * the name until the host removes the former connection, which takes a few seconds. Joins are refused as well while
 * the host reconnects its room to a new socket
 */
const JOIN_RETRY_DELAY: number = 2000;
const JOIN_RETRIES: number = 10;
const RETRIED_ERRORS: ReadonlySet<string> = new Set<string>([
    RoomApiErrorMessage.ALREADY_IN_GAME,
    RoomApiErrorMessage.ALREADY_IN_QUEUE,
    RoomApiErrorMessage.HOST_DISCONNECTED,
]);

/** The API refuses the join for a while only: joining again later may succeed */
export function isTemporaryJoinError(error: unknown): error is Error {
    return error instanceof Error && RETRIED_ERRORS.has(error.message);
}

/** The passwords of the client refused for ROOM_PASSWORD_LOCK_DELAY, after too many wrong ones */
function isPasswordLock(error: unknown): error is Error {
    return error instanceof Error && error.message === RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS;
}

/** The API refuses the join for a while, or the passwords of the client, when waiting for the end of their lock */
function isRetried(error: unknown, waitsForLock: boolean): error is Error {
    return isTemporaryJoinError(error) || (waitsForLock && isPasswordLock(error));
}

export interface JoinOptions {
    /** Called with the error refusing the first attempt, and with the lock of the passwords waited for, before asking again */
    onRetry?: (error: string) => void;
    /**
     * The player joined the room before, with its password: the lock of the passwords was caused by another client of
     * its IP. Waited for once, the lock ending ROOM_PASSWORD_LOCK_DELAY after the last wrong password: still locked, the
     * other client keeps guessing
     */
    passwordAccepted?: boolean;
    /** Stops asking once aborted, the player left the room: rejects with an AbortError */
    signal?: AbortSignal;
}

/**
 * Joins the room, asking again every 2 seconds for 20 seconds at most while the API refuses it for a while, or once
 * after the lock of the passwords
 * @throws {Error} the error refusing the last attempt, or another one, or an AbortError once the signal aborted
 */
export async function joinRoom(roomSocketApi: RoomSocketApi, request: RoomJoinRequest, { onRetry, passwordAccepted = false, signal }: JoinOptions = {}): Promise<RoomJoinResponse> {
    let lockWaited: boolean = false;

    for (let retry = 0; ; retry++) {
        signal?.throwIfAborted();

        try {
            // eslint-disable-next-line no-await-in-loop -- retries, one attempt after the other
            return await roomSocketApi.send(RoomApiRequestTypeEnum.JOIN, request);
        } catch (e) {
            if (!isRetried(e, passwordAccepted && !lockWaited) || retry === JOIN_RETRIES) {
                throw e;
            }

            const locked: boolean = isPasswordLock(e);

            if (retry === 0 || locked) {
                onRetry?.(e.message);
            }

            lockWaited ||= locked;
            // eslint-disable-next-line no-await-in-loop -- the delay between two attempts
            await wait(locked ? ROOM_PASSWORD_LOCK_DELAY * 1000 : JOIN_RETRY_DELAY, signal);
        }
    }
}
