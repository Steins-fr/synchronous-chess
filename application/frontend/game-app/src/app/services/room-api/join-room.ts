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

/**
 * The API refuses the join for a while. The passwords of a client which gave too many wrong ones are refused for
 * ROOM_PASSWORD_LOCK_DELAY: once its password accepted, they were the ones of another client of its IP
 */
function isRetried(error: unknown, passwordAccepted: boolean): error is Error {
    return isTemporaryJoinError(error) || (passwordAccepted && error instanceof Error && error.message === RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
}

/**
 * Joins the room, asking again every 2 seconds for 20 seconds at most while the API refuses it for a while, or after
 * the lock of the passwords, 10 times at most
 * @param onRetry called with the error refusing the first attempt, before asking again
 * @param passwordAccepted the player joined the room before, with its password: it waits for the end of a lock of the
 * passwords, caused by another client of its IP, rather than giving the room up
 * @throws {Error} the error refusing the last attempt, or another one
 */
export async function joinRoom(
    roomSocketApi: RoomSocketApi,
    request: RoomJoinRequest,
    onRetry: (error: string) => void = (): void => undefined,
    passwordAccepted: boolean = false,
): Promise<RoomJoinResponse> {
    for (let retry = 0; ; retry++) {
        try {
            // eslint-disable-next-line no-await-in-loop -- retries, one attempt after the other
            return await roomSocketApi.send(RoomApiRequestTypeEnum.JOIN, request);
        } catch (e) {
            if (!isRetried(e, passwordAccepted) || retry === JOIN_RETRIES) {
                throw e;
            }

            if (retry === 0) {
                onRetry(e.message);
            }

            const delay: number = e.message === RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS ? ROOM_PASSWORD_LOCK_DELAY * 1000 : JOIN_RETRY_DELAY;
            // eslint-disable-next-line no-await-in-loop -- the delay between two attempts
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
    }
}
