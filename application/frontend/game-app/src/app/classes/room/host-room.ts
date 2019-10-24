import { Room } from './room';
import { SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import { PlayerType, PlayerMessageType, SignalPayload, RemoteSignalPayload, Player, PlayerMessage } from '../player/player';
import { Webrtc } from '../webrtc/webrtc';

export class HostRoom extends Room {

    public initiator: boolean = true;

    protected notifyRoomCreation(): void {
        // TODO: Need API class
        this.socketService.send('sendmessage', 'create', JSON.stringify({ roomName: this.roomName, maxPlayer: 6, playerName: this.localPlayer.name }));
    }

    protected onSocketMessage(payload: SocketPayload): void {
        switch (payload.type) {
            case 'created':
                this.hasSucceeded.next(true);
                this.hasSucceeded.complete();
                this.hasSucceeded = undefined;
                break;
            case 'joinRequest':
                const data: any = JSON.parse(payload.data); // TODO: data type
                const player: Player = this.newPlayer(data.playerName, PlayerType.PEER_OFFER);
                player.negotiateBySocket(new Webrtc(), this.socketService);
                this.addPlayer(player);
                break;
        }
    }

    protected transmitNewPlayer(playerName: string): void {
        this.players.forEach((player: Player) => {

            player.sendData({
                type: PlayerMessageType.NEW_PLAYER,
                payload: JSON.stringify({
                    playerName
                }),
                isPrivate: true,
                from: this.localPlayer.name
            });
        });
    }

    protected onPlayerConnected(playerName: string): void {
        this.transmitNewPlayer(playerName);
        this.socketService.send('sendmessage', 'playerAdd', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }
    protected onPlayerDisconnected(playerName: string): void {
        this.socketService.send('sendmessage', 'playerRemove', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }

    protected onPeerPrivateMessage(playerMessage: PlayerMessage, fromPlayer: string): void {
        if (playerMessage.isPrivate === false) {
            return;
        }

        if (playerMessage.type === PlayerMessageType.SIGNAL) {
            const signalPayload: SignalPayload = JSON.parse(playerMessage.payload);
            if (this.players.has(signalPayload.to) === false) {
                return;
            }

            const player: Player = this.players.get(signalPayload.to);
            const remoteSignalPayload: RemoteSignalPayload = {
                from: fromPlayer,
                signal: signalPayload.signal
            };

            player.sendData({
                type: PlayerMessageType.REMOTE_SIGNAL,
                payload: JSON.stringify(remoteSignalPayload),
                isPrivate: true,
                from: this.localPlayer.name
            });
        }
    }
}
