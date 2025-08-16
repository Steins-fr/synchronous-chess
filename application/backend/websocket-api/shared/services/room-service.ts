import BadRequestException from '@exceptions/bad-request-exception';
import Connection from '@models/connection';
import Room from '@models/room';
import RoomRepository from '@repositories/room-repository';

export default class RoomService {
    private readonly roomRepository: RoomRepository = new RoomRepository();

    public async removeConnectionFromRoom(room: Room, connection: Connection): Promise<void> {
        if (room.connectionId === connection.connectionId) {
            await this.deleteRoom(room);
        } else if (room.id !== undefined) {
            await this.removePlayerFromQueue(connection.connectionId, room);
        }
    }

    public async getRoomByName(roomName: string): Promise<Room> {
        const room = await this.roomRepository.getByName(roomName);

        if (room === null) {
            throw new BadRequestException(`Room '${ roomName }' does not exist`);
        }

        return room;
    }

    public async canEditRoomGuard(room: Room, connectionId: string): Promise<void> {
        if (room.connectionId !== connectionId) {
            throw new BadRequestException('You are not the host of the room');
        }
    }

    public async roomExist(roomName: string): Promise<boolean> {
        return await this.roomRepository.getByName(roomName) !== null;
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
        await this.roomRepository.put({
            id: roomName,
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
