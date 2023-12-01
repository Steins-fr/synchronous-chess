import { Negotiator, NegotiatorEventType } from '@app/classes/negotiator/negotiator';
import { PlayerType } from '@app/classes/player/player';
import { Webrtc, RtcSignal } from '@app/classes/webrtc/webrtc';
import FullNotification from '@app/services/room-api/notifications/full-notification';
import SignalNotification from '@app/services/room-api/notifications/signal-notification';
import { RoomApiService, RoomApiNotificationType } from '@app/services/room-api/room-api.service';

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

    protected handleSignal(signal: RtcSignal): void {
        this.roomApi.signal(signal, this.playerName, this.roomName).then().catch((err: string) => {
            console.error(err);
        });
    }

    public override clear(): void {
        this.roomApi.notifier.unfollow(RoomApiNotificationType.FULL, this);
        this.roomApi.notifier.unfollow(RoomApiNotificationType.REMOTE_SIGNAL, this);
        super.clear();
    }
}
