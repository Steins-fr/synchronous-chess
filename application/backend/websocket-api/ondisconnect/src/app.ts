import { RoomService, Room, Connection, ConnectionService } from '/opt/nodejs/room-manager';

interface Response {
    statusCode: number;
    body: string;
}

const ddb: RoomService = new RoomService();
const connectionService: ConnectionService = new ConnectionService();

export const handler: (event: any) => Promise<Response> = async function (event: any): Promise<Response> {

    const connectionId: string = event.requestContext.connectionId;

    try {
        const connection: Connection = await connectionService.get(connectionId);
        if (connection.connectionId === undefined) {
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
