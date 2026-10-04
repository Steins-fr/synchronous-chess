import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Player } from '../player/player';
import { RoomHosting } from './room-hosting';
import { RoomNetwork } from './room-network';

/** The network of the player creating the room, which hosts it until it leaves */
export class HostRoomNetwork extends RoomNetwork {

    public readonly initiator: boolean = true;

    public get hostName(): string {
        return this.localPlayer.name;
    }

    private readonly hosting: RoomHosting;

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        maxPlayer: number,
        localPlayerName: string,
        /** The token the host created the room with */
        token: string,
    ) {
        super(roomApi, roomName, localPlayerName);
        this.hosting = new RoomHosting(this.hostingContext(maxPlayer, token));
        this.hosting.roomLost$.subscribe(() => this.roomLostSubject.next());
    }

    /** The host never notices its own departure: the others take over */
    public changeHost(): void {
        // Nothing to do
    }

    protected onPlayerConnected(player: Player): void {
        this.hosting.onPlayerConnected(player);
    }

    protected onPlayerDisconnected(player: Player): void {
        this.hosting.onPlayerDisconnected(player);
    }

    /** The host only relays the signals of the players, as every participant */
    protected onRoomMessage(): void {
        // Nothing to do
    }

    public override clear(): void {
        this.hosting.clear();
        super.clear();
    }
}
