import { RoomService, Room, Connection, ConnectionService } from '../../../layers/room-manager/src/index';
import { APIGatewayProxyEvent } from 'aws-lambda';

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

        const room: Room = await ddb.getRoomByName(connection.roomName);
        try {
            await ddb.removeConnectionFromRoom(room, connection);
        } catch (e) {
            console.error(e);
        }
        await connectionService.delete(connection);
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Internal server error' };
    }

    return { statusCode: 200, body: 'Closed' };
};
