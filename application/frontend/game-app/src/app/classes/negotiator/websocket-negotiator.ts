import { Subscription } from 'rxjs';

import { Webrtc, Signal } from '../webrtc/webrtc';
import { Negotiator } from './negotiator';

import { SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import { RoomApiService, RoomApiResponseType } from 'src/app/services/room-api/room-api.service';

export class WebsocketNegotiator extends Negotiator {

    private readonly negotiationSub: Subscription;

    public constructor(roomName: string, playerName: string, webRTC: Webrtc,
        private readonly roomApi: RoomApiService) {

        super(roomName, playerName, webRTC);
        this.negotiationSub = this.roomApi.message.subscribe((payload: SocketPayload) => {

            // TODO: do another way !
            if (payload.type !== RoomApiResponseType.REMOTE_SIGNAL) {
                return;
            }
            this.negotiationMessage(JSON.parse(payload.data));
        });
    }

    protected handleSignal(signal: Signal): void {
        this.roomApi.signal(signal, this.playerName, this.roomName).then().catch((err: string) => {
            console.error(err);
        });
    }

    public clear(): void {
        this.negotiationSub.unsubscribe();
        super.clear();
    }
}
