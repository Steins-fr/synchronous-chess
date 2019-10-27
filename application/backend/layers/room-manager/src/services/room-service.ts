import Player from '../entities/player';
import Room from '../entities/room';
import Connection from '../entities/connection';
import RoomRepository from '../repositories/room-repository';

export default class RoomService {

    private readonly roomRepository: RoomRepository = new RoomRepository();

    public async removeConnectionFromRoom(room: Room, connection: Connection): Promise<void> {
        if (room.connectionId === connection.connectionId) {
            await this.deleteRoom(room);
        } else if (room.ID !== undefined) {
            await this.removePlayerFromQueue(connection.connectionId, room);
        }
    }

    public getRoomByName(roomName: string): Promise<Room> {
        return this.roomRepository.getByName(roomName);
    }

    public getRoomByKeys(connectionId: string, roomName: string): Promise<Room> {
        return this.roomRepository.getByKeys(connectionId, roomName);
    }

    public async roomExist(roomName: string): Promise<boolean> {
        try {
            await this.getRoomByName(roomName);
            return true;
        } catch (e) {
            return false;
        }
    }

    public async addPlayerToRoom(playerName: string, room: Room): Promise<void> {
        await this.roomRepository.addPlayerToRoom({ playerName }, room);
    }

    public async removePlayerFromRoom(playerName: string, room: Room): Promise<void> {
        await this.roomRepository.removePlayerFromRoom(playerName, room);
    }

    private async removePlayerFromQueue(connectionId: string, room: Room): Promise<void> {
        await this.roomRepository.removePlayerFromQueue(connectionId, room);
    }

    public async addPlayerToQueue(playerName: string, connectionId: string, room: Room): Promise<void> {
        await this.roomRepository.addPlayerToQueue({ playerName, connectionId }, room);
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
