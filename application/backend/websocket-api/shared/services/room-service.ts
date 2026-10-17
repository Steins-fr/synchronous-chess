import BadRequestException from '@exceptions/bad-request-exception';
import { hashPassword } from '@helpers/password.helper';
import { searchKey } from '@helpers/search.helper';
import { epochSeconds } from '@helpers/time.helper';
import { hashToken } from '@helpers/token.helper';
import RoomHelper from '@helpers/room-helper';
import Connection from '@models/connection';
import Room from '@models/room';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomGame } from '@protocol/room-game.enum';
import RoomRepository, { ListedRoom } from '@repositories/room-repository';

export default class RoomService {
    /** How long a room waits for its disconnected host to reconnect it, in seconds */
    public static readonly HOST_RECONNECTION_DELAY: number = 10 * 60;
    /** The most rooms listed: a search finds the others */
    public static readonly MAX_OPEN_ROOMS: number = 30;

    private readonly roomRepository: RoomRepository = new RoomRepository();

    private static isExpired(room: Room): boolean {
        return room.expiresAt !== undefined && room.expiresAt <= epochSeconds();
    }

    /** The room of a disconnected host waits for it to reconnect, a disconnected guest leaves the queue */
    public async removeConnectionFromRoom(room: Room, connection: Connection): Promise<void> {
        if (room.connectionId === connection.connectionId) {
            await this.roomRepository.waitForHost(room, connection.connectionId, epochSeconds() + RoomService.HOST_RECONNECTION_DELAY);
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

    /**
     * The rooms of the game, the full ones and the ones waiting for their host included: a participant joins its room
     * again once it has a place or its host is back. Without search, the most recent first. With a search, the rooms
     * whose name holds it, whatever the case: the names starting with it first, then by name
     * @param search a part of the name of the room: none when empty
     */
    public async getOpenRooms(game: RoomGame, search: string = ''): Promise<RoomsResponse> {
        const searched: string = searchKey(search);
        // One more room tells more exist
        const maxRooms: number = RoomService.MAX_OPEN_ROOMS + 1;
        const rooms: ListedRoom[] = searched === ''
            ? await this.roomRepository.findRecentRooms(game, epochSeconds(), maxRooms)
            : await this.roomRepository.findRoomsContaining(game, searched, epochSeconds(), maxRooms);

        return {
            rooms: rooms.slice(0, RoomService.MAX_OPEN_ROOMS).map((room: ListedRoom): OpenRoom => ({
                roomName: room.id,
                // The names of a private room are told to the players giving its password only
                hostPlayer: room.isPrivate ? undefined : room.hostPlayer,
                playerCount: room.playerCount,
                maxPlayer: room.maxPlayer,
                isPrivate: room.isPrivate,
                hostConnected: room.expiresAt === undefined,
            })),
            hasMore: rooms.length > RoomService.MAX_OPEN_ROOMS,
        };
    }

    /**
     * Before a player joins the room, from a page of its game only: the room of another game runs other messages
     * @throws {BadRequestException} when the room is of another game (OTHER_GAME)
     */
    public gameGuard(room: Room, game: RoomGame): void {
        if (room.game !== game) {
            throw new BadRequestException(RoomApiErrorMessage.OTHER_GAME);
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
     * Creates the room of the request, hosted by the connection: private with a password, kept as a hash. The token of
     * the host is kept as a hash too, to reconnect the room later
     * @throws {BadRequestException} when a room of that name exists, even waiting for its host
     */
    public async create(request: RoomCreateRequest, connectionId: string): Promise<void> {
        const room: Room = {
            id: request.roomName,
            connectionId,
            hostPlayer: request.playerName,
            maxPlayer: request.maxPlayer,
            game: request.game,
            createdAt: new Date().toISOString(),
            nameKey: searchKey(request.roomName),
            players: [{ playerName: request.playerName }],
            queue: [],
            tokenHashes: { [request.playerName]: hashToken(request.token) },
            isPrivate: request.password !== undefined,
        };

        if (request.password !== undefined) {
            room.passwordHash = hashPassword(request.password);
        }

        const created: boolean = await this.roomRepository.create(room, epochSeconds());

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
        if (!await this.roomRepository.reconnectHost(room, connectionId, playerName, hashToken(token), epochSeconds())) {
            throw new BadRequestException('You are not the host of the room');
        }
    }
}
