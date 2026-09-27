import { CommonModule } from '@angular/common';
import {
    Component,
    computed,
    input
} from '@angular/core';
import { Negotiator } from '@app/services/room-manager/classes/negotiator/negotiator';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { WebrtcStatesComponent } from '../webrtc-states/webrtc-states.component';

@Component({
    selector: 'app-debug-webrtc',
    templateUrl: './webrtc-debug.component.html',
    imports: [CommonModule, WebrtcStatesComponent],
})
export class WebrtcDebugComponent<M extends object> {
    public readonly room = input.required<Room<M>>();

    protected readonly negotiators = computed<ReadonlyArray<Readonly<Negotiator>>>(() => Array.from(this.room().roomConnection.negotiators().values()));

    protected readonly webRtcPlayers = computed<ReadonlyArray<Readonly<WebRtcPlayer>>>(() => {
        const webRtcPlayers: WebRtcPlayer[] = [];
        const players = this.room().players();

        for (const player of players) {
            if (player instanceof WebRtcPlayer) {
                webRtcPlayers.push(player);
            }
        }

        return webRtcPlayers;
    });
}
