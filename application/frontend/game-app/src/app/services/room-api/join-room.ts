import RoomJoinRequest from '@protocol/requests/room-join-request';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { RoomSocketApi } from './room-socket.api';

/**
 * A player reloading the page joins again under its name before the host noticed it left: the websocket API refuses
 * the name until the host removes the former connection, which takes a few seconds. Joins are refused as well while
 * the host reconnects its room to a new socket
 */
const JOIN_RETRY_DELAY: number = 2000;
const JOIN_RETRIES: number = 10;
const RETRIED_ERRORS: ReadonlySet<string | undefined> = new Set([
    RoomApiErrorMessage.ALREADY_IN_GAME,
    RoomApiErrorMessage.ALREADY_IN_QUEUE,
    RoomApiErrorMessage.HOST_DISCONNECTED,
]);

/**
 * Joins the room, asking again every 2 seconds for 20 seconds at most while the API refuses it for a while
 * @param onRetry called with the error refusing the first attempt, before asking again
 * @throws {Error} the error refusing the last attempt, or another one
 */
export async function joinRoom(roomSocketApi: RoomSocketApi, request: RoomJoinRequest, onRetry: (error: string) => void = (): void => undefined): Promise<RoomJoinResponse> {
    for (let retry = 0; ; retry++) {
        try {
            // eslint-disable-next-line no-await-in-loop -- retries, one attempt after the other
            return await roomSocketApi.send(RoomApiRequestTypeEnum.JOIN, request);
        } catch (e) {
            const message: string | undefined = e instanceof Error ? e.message : undefined;

            if (message === undefined || !RETRIED_ERRORS.has(message) || retry === JOIN_RETRIES) {
                throw e;
            }

            if (retry === 0) {
                onRetry(message);
            }

            // eslint-disable-next-line no-await-in-loop -- the delay between two attempts
            await new Promise<void>((resolve) => setTimeout(resolve, JOIN_RETRY_DELAY));
        }
    }
}
