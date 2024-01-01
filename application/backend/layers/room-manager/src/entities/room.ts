import Player from './player';

export default interface Room {
    ID: string;
    connectionId: string;
    hostPlayer: string;
    maxPlayer: number;
    players: Player[];
    queue: Player[];
}
