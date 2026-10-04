import BadRequestException from '@exceptions/bad-request-exception';
import { hashToken } from '@helpers/token.helper';
import RoomHelper from '@helpers/room-helper';
import Connection from '@models/connection';
import Room from '@models/room';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomRepository from '@repositories/room-repository';

export default class RoomService {
    /** How long a room waits for its disconnected host to reconnect it, in seconds */
    public static readonly HOST_RECONNECTION_DELAY: number = 10 * 60;

    private readonly roomRepository: RoomRepository = new RoomRepository();

    /** In epoch seconds, the unit of the TTL of DynamoDB */
    private static now(): number {
        return Math.floor(Date.now() / 1000);
    }

    private static isExpired(room: Room): boolean {
        return room.expiresAt !== undefined && room.expiresAt <= RoomService.now();
    }

    /** The room of a disconnected host waits for it to reconnect, a disconnected guest leaves the queue */
    public async removeConnectionFromRoom(room: Room, connection: Connection): Promise<void> {
        if (room.connectionId === connection.connectionId) {
            await this.roomRepository.waitForHost(room, connection.connectionId, RoomService.now() + RoomService.HOST_RECONNECTION_DELAY);
        } else if (RoomHelper.findPlayerConnectionId(room.queue, connection.connectionId) !== null) {
            await this.removePlayerFromQueue(connection.connectionId, room);
        }
        // Otherwise a former connection of the host, which reconnected the room to another one
    }

    /** @throws {BadRequestException} when the room does not exist, or expired */
    public async getRoomByName(roomName: string): Promise<Room> {
        const room = await this.roomRepository.getByName(roomName);

        if (room === null || RoomService.isExpired(room)) {
            throw new BadRequestException(`Room '${ roomName }' does not exist`);
        }

        return room;
    }

    /**
     * A connection hosts a single room: moved to another one, the room it hosts would never wait for it
     * @throws {BadRequestException} when the connection hosts a room
     */
    public async notHostingGuard(connection: Connection | null): Promise<void> {
        if (connection === null) {
            return;
        }

        const room: Room | null = await this.roomRepository.getByName(connection.roomName);

        if (room?.connectionId === connection.connectionId) {
            throw new BadRequestException('Already hosting a room');
        }
    }

    public canEditRoomGuard(room: Room, connectionId: string): void {
        if (room.connectionId !== connectionId) {
            throw new BadRequestException('You are not the host of the room');
        }
    }

    /** Before reaching the host: its connection is gone while the room waits for it */
    public hostConnectedGuard(room: Room): void {
        if (room.expiresAt !== undefined) {
            throw new BadRequestException(RoomApiErrorMessage.HOST_DISCONNECTED);
        }
    }

    /** Once: the host declares again a player whose connection it restored */
    public async addPlayerToRoom(playerName: string, room: Room): Promise<void> {
        if (!RoomHelper.isInGame(room, playerName)) {
            await this.roomRepository.addPlayerToRoom({ playerName }, room);
        }
    }

    public async removePlayerFromRoom(playerName: string, room: Room): Promise<void> {
        await this.roomRepository.removePlayerFromRoom(playerName, room);
    }

    private async removePlayerFromQueue(connectionId: string, room: Room): Promise<void> {
        await this.roomRepository.removePlayerFromQueue(connectionId, room);
    }

    public async addPlayerToQueue(playerName: string, connectionId: string, token: string, room: Room): Promise<void> {
        await this.roomRepository.addPlayerToQueue({ playerName, connectionId }, hashToken(token), room);
    }

    /**
     * @param token the token of the host, to reconnect the room later
     * @throws {BadRequestException} when a room of that name exists, even waiting for its host
     */
    public async create(roomName: string, connectionId: string, playerName: string, maxPlayer: number, token: string): Promise<void> {
        const created: boolean = await this.roomRepository.create({
            id: roomName,
            connectionId,
            hostPlayer: playerName,
            maxPlayer,
            players: [{ playerName }],
            queue: [],
            tokenHashes: { [playerName]: hashToken(token) },
        }, RoomService.now());

        if (!created) {
            throw new BadRequestException(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
        }
    }

    /**
     * Before a player reconnects the room: another player than the host must be in the room, and can only take over a
     * room waiting for its host
     * @throws {BadRequestException} when the player is not in the room, or the host is connected (HOST_CONNECTED)
     */
    public reconnectHostGuard(room: Room, playerName: string): void {
        if (playerName === room.hostPlayer) {
            return;
        }

        if (!RoomHelper.isInGame(room, playerName)) {
            throw new BadRequestException('You are not the host of the room');
        }

        if (room.expiresAt === undefined) {
            throw new BadRequestException(RoomApiErrorMessage.HOST_CONNECTED);
        }
    }

    /**
     * Moves the room to a connection of the player, which becomes its host
     * @throws {BadRequestException} when the token is not the one of the player, or the host reconnected meanwhile
     */
    public async reconnectHost(room: Room, connectionId: string, playerName: string, token: string): Promise<void> {
        if (!await this.roomRepository.reconnectHost(room, connectionId, playerName, hashToken(token), RoomService.now())) {
            throw new BadRequestException('You are not the host of the room');
        }
    }
}
