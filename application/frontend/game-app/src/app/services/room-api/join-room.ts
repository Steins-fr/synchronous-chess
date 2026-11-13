import { wait } from '@app/helpers/wait.helper';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { RoomApiError, RoomSocketApi } from './room-socket.api';

/**
 * A player reloading the page joins again under its name, with its token, before the host noticed it left: the
 * websocket API refuses its former connection until the host removes it, which takes a few seconds. Joins are refused
 * as well while the host reconnects its room to a new socket. A name another player holds is refused at once
 */
const JOIN_RETRY_DELAY: number = 2000;
const JOIN_RETRIES: number = 10;
const RETRIED_ERRORS: ReadonlySet<string> = new Set<string>([
    RoomApiErrorMessage.FORMER_CONNECTION,
    RoomApiErrorMessage.HOST_DISCONNECTED,
]);

/** The API refuses the join for a while only: joining again later may succeed */
export function isTemporaryJoinError(error: unknown): error is Error {
    return error instanceof Error && RETRIED_ERRORS.has(error.message);
}

/** The API refuses the name: another player, of another token, holds it in the room, or waits to enter it */
export function isNameTakenError(error: unknown): error is RoomApiError {
    return error instanceof RoomApiError
        && (error.message === RoomApiErrorMessage.ALREADY_IN_GAME || error.message === RoomApiErrorMessage.ALREADY_IN_QUEUE);
}

export interface JoinOptions {
    /** Called with the error refusing the first attempt, before asking again */
    onRetry?: (error: string) => void;
    /** Stops asking once aborted, the player left the room: rejects with an AbortError */
    signal?: AbortSignal;
}

/**
 * Joins the room, asking again every 2 seconds for 20 seconds at most while the API refuses it for a while
 * @throws {Error} the error refusing the last attempt, or another one, or an AbortError once the signal aborted
 */
export async function joinRoom(roomSocketApi: RoomSocketApi, request: RoomJoinRequest, { onRetry, signal }: JoinOptions = {}): Promise<RoomJoinResponse> {
    for (let retry = 0; ; retry++) {
        signal?.throwIfAborted();

        try {
            // eslint-disable-next-line no-await-in-loop -- retries, one attempt after the other
            return await roomSocketApi.send(RoomApiRequestTypeEnum.JOIN, request);
        } catch (e) {
            if (!isTemporaryJoinError(e) || retry === JOIN_RETRIES) {
                throw e;
            }

            if (retry === 0) {
                onRetry?.(e.message);
            }

            // eslint-disable-next-line no-await-in-loop -- the delay between two attempts
            await wait(JOIN_RETRY_DELAY, signal);
        }
    }
}
