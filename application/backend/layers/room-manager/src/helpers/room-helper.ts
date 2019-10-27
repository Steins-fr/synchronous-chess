import Player from '../entities/player';
import Room from '../entities/room';

export default abstract class RoomHelper {

    public static findPlayerWith(players: Array<Player>, test: (player: Player) => boolean): Player | null {
        if (players === undefined) {
            return null;
        }

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
        return RoomHelper.findPlayerWith(players, playerNameTest);
    }

    public static findPlayerConnectionId(players: Array<Player>, connectionId: string): Player | null {
        const connectionIdTest: (player: Player) => boolean = (player: Player): boolean =>
            player.connectionId !== undefined && player.connectionId === connectionId;
        return RoomHelper.findPlayerWith(players, connectionIdTest);
    }

    public static getPlayerByName(room: Room, playerName: string): Player | null {
        return RoomHelper.findPlayerByName(room.players, playerName) || RoomHelper.findPlayerByName(room.queue, playerName);
    }

    public static getPlayerByConnectionId(room: Room, connectionId: string): Player | null {
        return RoomHelper.findPlayerConnectionId(room.players, connectionId) || RoomHelper.findPlayerConnectionId(room.queue, connectionId);
    }

    public static isInQueue(room: Room, playerName: string): boolean {
        return !!RoomHelper.findPlayerByName(room.queue, playerName);
    }

    public static isInGame(room: Room, playerName: string): boolean {
        return !!RoomHelper.findPlayerByName(room.players, playerName);
    }
}
