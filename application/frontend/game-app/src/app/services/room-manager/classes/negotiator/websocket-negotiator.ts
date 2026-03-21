import FullNotification from '@app/services/room-api/notifications/full-notification';
import SignalNotification from '@app/services/room-api/notifications/signal-notification';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApi,
    RoomSocketApiNotificationEnum
} from '@app/services/room-api/room-socket.api';
import { RtcSignal, Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { Subject, takeUntil } from 'rxjs';
import { Negotiator, NegotiatorEventType } from './negotiator';

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
            this.pushEvent(NegotiatorEventType.DISCONNECTED);
        }
    }

    private onRemoteSignal(data: SignalNotification): void {
        this.negotiationMessage(data).then(() => console.debug('Negotiation message sent'));
    }

    protected handleSignal(signal: RtcSignal): void {
        // FIXME: code
        this.roomSocketApi.send(RoomApiRequestTypeEnum.SIGNAL, { signal, to: this.playerName, roomName: this.roomName }).then().catch((err: string) => {
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
