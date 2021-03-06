import { Webrtc, Signal } from '../webrtc/webrtc';
import { Negotiator, NegotiatorEventType } from './negotiator';

import { RoomApiService, RoomApiNotificationType } from '../../services/room-api/room-api.service';
import SignalNotification from '../../services/room-api/notifications/signal-notification';
import FullNotification from '../../services/room-api/notifications/full-notification';
import { PlayerType } from '../player/player';

export class WebsocketNegotiator extends Negotiator {

    public constructor(private readonly roomName: string, playerName: string, playerType: PlayerType, webRTC: Webrtc,
        private readonly roomApi: RoomApiService) {

        super(playerName, playerType, webRTC);
        this.roomApi.notifier.follow(RoomApiNotificationType.REMOTE_SIGNAL, this, (data: SignalNotification) => this.onRemoteSignal(data));
        this.roomApi.notifier.follow(RoomApiNotificationType.FULL, this, (data: FullNotification) => this.onFull(data));
    }

    private onFull(data: FullNotification): void {
        if (data.from === this.playerName) {
            this.pushEvent(NegotiatorEventType.DISCONNECTED);
        }
    }

    private onRemoteSignal(data: SignalNotification): void {
        this.negotiationMessage(data);
    }

    protected handleSignal(signal: Signal): void {
        this.roomApi.signal(signal, this.playerName, this.roomName).then().catch((err: string) => {
            console.error(err);
        });
    }

    public clear(): void {
        this.roomApi.notifier.unfollow(RoomApiNotificationType.FULL, this);
        this.roomApi.notifier.unfollow(RoomApiNotificationType.REMOTE_SIGNAL, this);
        super.clear();
    }
}
