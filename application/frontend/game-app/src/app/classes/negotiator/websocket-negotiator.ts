import { Webrtc, Signal } from '../webrtc/webrtc';
import { Negotiator } from './negotiator';

import { RoomApiService, RoomApiNotificationType } from 'src/app/services/room-api/room-api.service';
import SignalNotification from 'src/app/services/room-api/notifications/signal-notification';

export class WebsocketNegotiator extends Negotiator {

    public constructor(roomName: string, playerName: string, webRTC: Webrtc,
        private readonly roomApi: RoomApiService) {

        super(roomName, playerName, webRTC);
        this.roomApi.followNotification(RoomApiNotificationType.REMOTE_SIGNAL, this, (data: SignalNotification) => this.onRemoteSignal(data));
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
        this.roomApi.unfollowNotification(RoomApiNotificationType.REMOTE_SIGNAL, this);
        super.clear();
    }
}
