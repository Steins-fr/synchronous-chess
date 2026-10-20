import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { notificationCommand } from '@helpers/notification.helper';
import RoomHelper from '@helpers/room-helper';
import Connection from '@models/connection';
import Player from '@models/player';
import Room from '@models/room';
import { RoomSocketApiNotificationEnum } from '@protocol/socket-packet-payload.type';
import ConnectionService from '@services/connection-service';
import RoomService from '@services/room-service';

/**
 * What the closing of a connection does: its room told and left, then the connection deleted. Run by $disconnect, and by
 * sendmessage once the connection it answers closed while its request ran: $disconnect then found nothing to undo yet
 */
export default class DisconnectionService {
    private readonly roomService: RoomService = new RoomService();
    private readonly connectionService: ConnectionService = new ConnectionService();

    /** @param client the management API telling the host, built when needed only */
    public constructor(private readonly client: () => ApiGatewayManagementApiClient) {}

    /**
     * @param written the connection a request wrote: deleted already when $disconnect ran between the writes of the
     * request, what it wrote after is undone all the same. Undone again otherwise, which changes nothing
     * @returns false without the connection: never created, or deleted already
     * @throws {DatabaseException} when the connection can not be read or deleted
     */
    public async disconnect(connectionId: string, written?: Connection): Promise<boolean> {
        const connection: Connection | null = await this.connectionService.get(connectionId) ?? written ?? null;
        if (connection === null) {
            return false;
        }

        try {
            const room: Room = await this.roomService.getRoomByName(connection.roomName);
            await this.notifyCancelledJoin(room, connection);
            await this.roomService.removeConnectionFromRoom(room, connection);
        } catch (e) {
            // The room expired, or could not be updated: the connection is deleted all the same
            console.error(e);
        }
        await this.connectionService.delete(connection);

        return true;
    }

    /**
     * Tells the host a player waiting to join its room left, before the player leaves the queue: the API refuses its name
     * until then, so a player joining again under it reaches the host after. Not a player of the room, which closes its
     * socket once connected, nor the host waited for
     */
    private async notifyCancelledJoin(room: Room, connection: Connection): Promise<void> {
        const player: Player | null = RoomHelper.findPlayerConnectionId(room.queue, connection.connectionId);

        if (player === null || room.expiresAt !== undefined || RoomHelper.isInGame(room, player.playerName)) {
            return;
        }

        try {
            await this.client().send(notificationCommand(RoomSocketApiNotificationEnum.JOIN_CANCELLED, room.connectionId, { playerName: player.playerName }));
        } catch (e) {
            // The host negotiating with the player gives it up later: the player leaves the queue all the same
            console.error(e);
        }
    }
}
