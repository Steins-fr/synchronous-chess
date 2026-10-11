import BadRequestException from '@exceptions/bad-request-exception';
import { hashPassword, isPassword, verifyPassword } from '@helpers/password.helper';
import { hashToken } from '@helpers/token.helper';
import RoomHelper from '@helpers/room-helper';
import Connection from '@models/connection';
import Room from '@models/room';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomGame } from '@protocol/room-game.enum';
import RoomRepository, { ListedRoom } from '@repositories/room-repository';

/** A room matching a search, and how well: 0 the best */
interface RankedRoom {
    room: ListedRoom;
    rank: number;
}

/**
 * How well a room matches a search, by its name then the name of its host, all in lower case: whole, at the start, then
 * within. 0 the best, -1 for no match
 */
function matchRank(name: string, host: string, search: string): number {
    return [name === search, name.startsWith(search), host === search, host.startsWith(search), name.includes(search), host.includes(search)]
        .indexOf(true);
}

export default class RoomService {
    /** How long a room waits for its disconnected host to reconnect it, in seconds */
    public static readonly HOST_RECONNECTION_DELAY: number = 10 * 60;
    /** The most rooms listed: a search finds the others */
    public static readonly MAX_OPEN_ROOMS: number = 30;
    /** The most recent rooms a search reads: the cost of a search is bounded, an older room is not found */
    public static readonly MAX_SEARCHED_ROOMS: number = 500;
    /** The wrong passwords in a row a private room accepts, before refusing the passwords for PASSWORD_LOCK_DELAY */
    public static readonly MAX_PASSWORD_FAILURES: number = 5;
    /** How long a private room refuses the passwords, too many wrong ones given in a row, in seconds */
    public static readonly PASSWORD_LOCK_DELAY: number = 60;

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

    /**
     * The rooms of the game, the full ones and the ones waiting for their host included: a participant joins its room
     * again once it has a place or its host is back. Without search, the most recent first; with a search, the best
     * match first (matchRank), then the most recent, among the MAX_SEARCHED_ROOMS most recent rooms
     * @param search part of the name of the room or of its host, whatever the case: none when empty
     */
    public async getOpenRooms(game: RoomGame, search: string = ''): Promise<RoomsResponse> {
        const searched: string = search.trim().toLocaleLowerCase();
        let rooms: ListedRoom[];

        if (searched === '') {
            // One more room tells more exist
            rooms = await this.roomRepository.findRecentRooms(game, RoomService.now(), RoomService.MAX_OPEN_ROOMS + 1);
        } else {
            const recentRooms: ListedRoom[] = await this.roomRepository.findRecentRooms(game, RoomService.now(), RoomService.MAX_SEARCHED_ROOMS);
            rooms = recentRooms
                .map((room: ListedRoom): RankedRoom => ({ room, rank: matchRank(room.id.toLocaleLowerCase(), room.hostPlayer.toLocaleLowerCase(), searched) }))
                .filter((ranked: RankedRoom): boolean => ranked.rank !== -1)
                // A stable sort: the most recent first among the matches of a rank
                .sort((a: RankedRoom, b: RankedRoom): number => a.rank - b.rank)
                .map((ranked: RankedRoom): ListedRoom => ranked.room);
        }

        return {
            rooms: rooms.slice(0, RoomService.MAX_OPEN_ROOMS).map((room: ListedRoom): OpenRoom => ({
                roomName: room.id,
                hostPlayer: room.hostPlayer,
                playerCount: room.players.length,
                maxPlayer: room.maxPlayer,
                isPrivate: room.passwordHash !== undefined,
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

    /**
     * Before a player joins a private room: a public room ignores the password. MAX_PASSWORD_FAILURES wrong passwords in
     * a row lock the room for PASSWORD_LOCK_DELAY, the passwords refused without being checked: a password is not
     * guessed by trying them all
     * @throws {BadRequestException} when the room is locked (TOO_MANY_PASSWORD_ATTEMPTS), or the password is not the one
     * of the private room (WRONG_PASSWORD)
     */
    public async passwordGuard(room: Room, password: string | undefined): Promise<void> {
        if (room.passwordHash === undefined) {
            return;
        }

        const now: number = RoomService.now();

        if (room.passwordLockedUntil !== undefined && room.passwordLockedUntil > now) {
            throw new BadRequestException(RoomApiErrorMessage.TOO_MANY_PASSWORD_ATTEMPTS);
        }

        if (isPassword(password) && verifyPassword(password, room.passwordHash)) {
            if (room.passwordFailures !== undefined) {
                await this.roomRepository.forgetPasswordFailures(room);
            }
            return;
        }

        if (await this.roomRepository.recordPasswordFailure(room) >= RoomService.MAX_PASSWORD_FAILURES) {
            await this.roomRepository.lockPassword(room, now + RoomService.PASSWORD_LOCK_DELAY);
        }

        throw new BadRequestException(RoomApiErrorMessage.WRONG_PASSWORD);
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
            players: [{ playerName: request.playerName }],
            queue: [],
            tokenHashes: { [request.playerName]: hashToken(request.token) },
        };

        if (request.password !== undefined) {
            room.passwordHash = hashPassword(request.password);
        }

        const created: boolean = await this.roomRepository.create(room, RoomService.now());

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
