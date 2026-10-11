import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getManagementApiEndpoint } from '@helpers/environment.helper';
import { notificationCommand } from '@helpers/notification.helper';
import RoomHelper from '@helpers/room-helper';
import Connection from '@models/connection';
import Player from '@models/player';
import Room from '@models/room';
import { RoomSocketApiNotificationEnum } from '@protocol/socket-packet-payload.type';
import RoomService from '@services/room-service';
import ConnectionService from '@services/connection-service';

interface Response {
    statusCode: number;
    body: string;
}

const ddb: RoomService = new RoomService();
const connectionService: ConnectionService = new ConnectionService();

/**
 * Tells the host a player waiting to join its room left, before the player leaves the queue: the API refuses its name
 * until then, so a player joining again under it reaches the host after. Not a player of the room, which closes its
 * socket once connected, nor the host waited for
 */
async function notifyCancelledJoin(event: APIGatewayProxyEvent, room: Room, connection: Connection): Promise<void> {
    const player: Player | null = RoomHelper.findPlayerConnectionId(room.queue, connection.connectionId);

    if (player === null || room.expiresAt !== undefined || RoomHelper.isInGame(room, player.playerName)) {
        return;
    }

    try {
        const client = new ApiGatewayManagementApiClient({ endpoint: getManagementApiEndpoint(event.requestContext.domainName) });
        await client.send(notificationCommand(RoomSocketApiNotificationEnum.JOIN_CANCELLED, room.connectionId, { playerName: player.playerName }));
    } catch (e) {
        // The host negotiating with the player gives it up later: the player leaves the queue all the same
        console.error(e);
    }
}

export const handler = async function (event: APIGatewayProxyEvent): Promise<Response> {

    const connectionId: string | undefined = event.requestContext.connectionId;

    if (connectionId === undefined) {
        return { statusCode: 500, body: 'Undefined connection' };
    }

    try {
        const connection = await connectionService.get(connectionId);
        if (connection?.connectionId === undefined) {
            return { statusCode: 500, body: 'Undefined connection' };
        }

        try {
            const room: Room = await ddb.getRoomByName(connection.roomName);
            await notifyCancelledJoin(event, room, connection);
            await ddb.removeConnectionFromRoom(room, connection);
        } catch (e) {
            // The room expired, or could not be updated: the connection is deleted all the same
            console.error(e);
        }
        await connectionService.delete(connection);
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Internal server error' };
    }

    return { statusCode: 200, body: 'Closed' };
};
