import Player from '../entities/player';
import Room from '../entities/room';
import Connection from '../entities/connection';
import RoomRepository from '../repositories/room-repository';

export default class RoomService {

    private readonly roomRepository: RoomRepository = new RoomRepository();

    public static findPlayerWith(players: Array<Player>, test: (player: Player) => boolean): Player | null {
        for (let i: number = 0; i < players.length; ++i) {
            const player: Player = players[i];
            if (test(player)) {
                return player;
            }
        }
        return null;
    }

    public static findPlayerByName(players: Array<Player>, playerName: string): Player | null {
        const playerNameTest: (player: Player) => boolean = (player: Player): boolean => player.playerName === playerName;
        return RoomService.findPlayerWith(players, playerNameTest);
    }

    public static findPlayerConnectionId(players: Array<Player>, connectionId: string): Player | null {
        const connectionIdTest: (player: Player) => boolean = (player: Player): boolean =>
            player.connectionId !== undefined && player.connectionId === connectionId;
        return RoomService.findPlayerWith(players, connectionIdTest);
    }

    public static getPlayerByName(room: Room, playerName: string): Player | null {
        return RoomService.findPlayerByName(room.players, playerName) || RoomService.findPlayerByName(room.queue, playerName);
    }

    public static getPlayerByConnectionId(room: Room, connectionId: string): Player | null {
        return RoomService.findPlayerConnectionId(room.players, connectionId) || RoomService.findPlayerConnectionId(room.queue, connectionId);
    }

    public static isInQueue(room: Room, playerName: string): boolean {
        return !!RoomService.findPlayerByName(room.queue, playerName);
    }

    public static isInGame(room: Room, playerName: string): boolean {
        return !!RoomService.findPlayerByName(room.players, playerName);
    }

    public async removeConnectionFromRoom(room: Room, connection: Connection): Promise<void> {
        if (room.connectionId === connection.connectionId) {
            await this.deleteRoom(room);
        } else if (room.ID !== undefined) {
            await this.removePlayerFromQueue(connection.connectionId, room);
        }
    }

    public getRoomByName(roomName: string): Promise<Room> {
        return this.roomRepository.getRoomByName(roomName);
    }

    public getRoomByKeys(connectionId: string, roomName: string): Promise<Room> {
        return this.roomRepository.getRoomByKeys(connectionId, roomName);
    }

    public async roomExist(roomName: string): Promise<boolean> {
        const room: Room = await this.getRoomByName(roomName);
        return room.ID !== undefined;
    }

    public async addPlayerToRoom(playerName: string, room: Room): Promise<void> {
        room.players.push({ playerName });
        await this.roomRepository.update(room);
    }

    public async removePlayerFromRoom(playerName: string, room: Room): Promise<void> {
        room.players = room.players.filter((player: Player) => player.playerName !== playerName);
        await this.roomRepository.update(room);
    }

    private async removePlayerFromQueue(connectionId: string, room: Room): Promise<void> {
        room.queue = room.queue.filter((player: Player) => player.connectionId !== connectionId);
        await this.roomRepository.update(room);
    }

    public async addRoomQueue(playerName: string, connectionId: string, room: Room): Promise<void> {
        room.queue.push({ playerName, connectionId });
        await this.roomRepository.update(room);
    }

    public async create(roomName: string, connectionId: string, playerName: string, maxPlayer: number): Promise<void> {
        await this.roomRepository.create({
            ID: roomName,
            connectionId,
            hostPlayer: playerName,
            maxPlayer,
            players: [{ playerName }],
            queue: []
        });
    }

    public async deleteRoom(room: Room): Promise<void> {
        await this.roomRepository.delete(room);
    }
}
