import { APIGatewayProxyEvent } from 'aws-lambda';
import RoomService from '@services/room-service';
import ConnectionService from '@services/connection-service';

interface Response {
    statusCode: number;
    body: string;
}

const ddb: RoomService = new RoomService();
const connectionService: ConnectionService = new ConnectionService();

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
            await ddb.removeConnectionFromRoom(await ddb.getRoomByName(connection.roomName), connection);
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
