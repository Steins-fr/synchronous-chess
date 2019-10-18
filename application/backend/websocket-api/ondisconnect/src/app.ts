import { RoomDatabase, Room } from '/opt/nodejs/room-database';

interface Response {
    statusCode: number;
    body: string;
}

const ddb: RoomDatabase = new RoomDatabase();

export const handler: (event: any) => Promise<Response> = async function (event: any): Promise<Response> {

    const connectionId: string = event.requestContext.connectionId;

    try {
        const roomName: string | null = await ddb.getRoomNameByConnectionId(connectionId);
        if (roomName === null) {
            return { statusCode: 500, body: 'Undefined connection' };
        }

        const room: Room = await ddb.getRoomByName(roomName);
        await ddb.removeConnectionIdFromRoom(room, connectionId);
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Internal server error' };
    }


    return { statusCode: 200, body: 'Closed' };
};
