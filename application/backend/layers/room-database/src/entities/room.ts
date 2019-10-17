import Player from './player';

export default interface Room {
    ID: string;
    connectionId: string;
    hostPlayer: string;
    maxPlayer: number;
    players: Array<Player>;
    queue: Array<Player>;
}
