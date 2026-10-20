import { APIGatewayProxyEvent } from 'aws-lambda';
import RoomService from '@services/room-service';

interface Response {
    statusCode: number;
    body: string;
}

const roomService: RoomService = new RoomService();

/**
 * The ping of an open connection (RoomApiRoute.PING), sent every 3 minutes by the host of a room during its game: renews
 * the lease of its room (RoomService.LEASE), a statement which keeps the database awake, paused 5 minutes after the last
 * one (seconds_until_auto_pause of infrastructure/main.tf). The closing of the connection is then always seen by
 * $disconnect, never by a database asleep. Answered by nothing: the route has no route response
 */
export const handler = async function (event: APIGatewayProxyEvent): Promise<Response> {
    const connectionId: string | undefined = event.requestContext.connectionId;

    if (connectionId === undefined) {
        return { statusCode: 500, body: 'Undefined connection' };
    }

    try {
        await roomService.renewLease(connectionId);
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Internal server error' };
    }

    return { statusCode: 200, body: 'Awake' };
};
