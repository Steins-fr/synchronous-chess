import { Room } from './room';
import { SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import { Player, PlayerType, PlayerMessageType, RemoteSignalPayload, PlayerMessage, NewPlayerPayload, RemoteSignalMessage } from '../player/player';
import { Webrtc } from '../webrtc/webrtc';

export class PeerRoom extends Room {
    public initiator: boolean = false;
    public hostPlayer?: Player;

    protected notifyRoomCreation(): void {
        // TODO: Need socket functions
        this.socketService.send('sendmessage', 'join', JSON.stringify({ roomName: this.roomName, playerName: this.localPlayer.name }));
    }

    protected onSocketMessage(payload: SocketPayload): void {
        if (payload.type === 'joiningRoom') {
            const data: any = JSON.parse(payload.data); // TODO: data type
            this.hostPlayer = this.newPlayer(data.playerName, PlayerType.PEER_ANSWER);
            this.hostPlayer.negotiateBySocket(new Webrtc(), this.socketService);
            this.addPlayer(this.hostPlayer);
        }
    }

    protected onPlayerConnected(): void {
        // Response for the request of joining the room
        this.hasSucceeded.next(true);
        this.hasSucceeded.complete();
        this.hasSucceeded = undefined;
    }

    protected onPlayerDisconnected(): void { }

    protected onPeerPrivateMessage(playerMessage: PlayerMessage, fromPlayer: string): void {
        if (playerMessage.isPrivate === false) {
            return;
        }

        switch (playerMessage.type) {
            case PlayerMessageType.NEW_PLAYER:
                this.onNewPlayer(JSON.parse(playerMessage.payload));
                break;
            case PlayerMessageType.REMOTE_SIGNAL:
                this.onRemoteSignal(JSON.parse(playerMessage.payload));
                break;
        }
    }

    private onNewPlayer(newPlayerPayload: NewPlayerPayload): void {
        if (this.localPlayer.name === newPlayerPayload.playerName) {
            this.socketService.close();
        }

        if (this.players.has(newPlayerPayload.playerName) === true) {
            return;
        }
        const player: Player = this.newPlayer(newPlayerPayload.playerName, PlayerType.PEER_OFFER);
        player.negotiateByPeer(new Webrtc(), this.hostPlayer);
        this.addPlayer(player);
    }

    private onRemoteSignal(remoteSignalPayload: RemoteSignalPayload): void {
        let player: Player;
        if (this.players.has(remoteSignalPayload.from) === false) { // Create new player
            player = this.newPlayer(remoteSignalPayload.from, PlayerType.PEER_ANSWER);
            player.negotiateByPeer(new Webrtc(), this.hostPlayer);
            this.addPlayer(player);
        } else { // If exists, get the receiving player.
            player = this.players.get(remoteSignalPayload.from);
        }

        const remoteSignalMessage: RemoteSignalMessage = {
            type: 'remoteSignal', // TODO: enum
            data: JSON.stringify(remoteSignalPayload)
        };
        player.negotiationMessage(remoteSignalMessage);
    }
}
