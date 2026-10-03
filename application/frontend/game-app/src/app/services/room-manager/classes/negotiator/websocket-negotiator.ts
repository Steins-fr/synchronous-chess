import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import FullNotification from '@protocol/notifications/full-notification';
import SignalNotification from '@protocol/notifications/signal-notification';
import { RtcSignal } from '@protocol/rtc-signal';
import { RoomApiRequestTypeEnum, RoomSocketApiNotificationEnum } from '@protocol/socket-packet-payload.type';
import { Subject, takeUntil } from 'rxjs';
import { Negotiator, NegotiatorConnectionState } from './negotiator';

export class WebsocketNegotiator extends Negotiator {
    private destroyRef = new Subject<void>();

    public constructor(
        private readonly roomName: string,
        playerName: string,
        webRTC: Webrtc,
        private readonly roomSocketApi: RoomSocketApi,
    ) {

        super(playerName, webRTC);
        this.roomSocketApi.notification$.pipe(takeUntil(this.destroyRef)).subscribe((notification) => {
            if (notification.type === RoomSocketApiNotificationEnum.FULL) {
                this.onFull(notification.data);
            } else if (notification.type === RoomSocketApiNotificationEnum.REMOTE_SIGNAL) {
                this.onRemoteSignal(notification.data);
            }
        });
    }

    private onFull(data: FullNotification): void {
        if (data.from === this.playerName) {
            this.setConnectionState(NegotiatorConnectionState.DISCONNECTED);
        }
    }

    private onRemoteSignal(data: SignalNotification): void {
        this.negotiationMessage(data).then(
            () => console.debug('Negotiation message sent'),
            (error: unknown) => console.error('Negotiation message failed', error),
        );
    }

    protected handleSignal(signal: RtcSignal): void {
        this.roomSocketApi.send(RoomApiRequestTypeEnum.SIGNAL, { signal, to: this.playerName, roomName: this.roomName }).catch((err: string) => {
            console.error(err);
        });
    }

    public override clear(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
        super.clear();
    }
}
