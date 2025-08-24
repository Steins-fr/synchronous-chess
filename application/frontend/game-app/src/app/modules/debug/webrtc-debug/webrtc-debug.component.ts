import { CommonModule } from '@angular/common';
import {
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Negotiator } from '@app/services/room-manager/classes/negotiator/negotiator';
import { Player } from '@app/services/room-manager/classes/player/player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Subscription } from 'rxjs';
import { WebrtcStatesComponent } from '../webrtc-states/webrtc-states.component';

@Component({
    selector: 'app-debug-webrtc',
    templateUrl: './webrtc-debug.component.html',
    imports: [CommonModule, WebrtcStatesComponent],
})
export class WebrtcDebugComponent<RoomServiceNotification extends RoomMessage>  {
    private readonly destroyRef = inject(DestroyRef);

    public readonly room = input.required<Room<RoomServiceNotification>>();

    private readonly players = signal<Player[]>([]);
    protected readonly negotiators = signal<Negotiator[]>([]);

    protected readonly webRtcPlayers = computed<WebRtcPlayer[]>(() => {
        const webRtcPlayers: WebRtcPlayer[] = [];
        const players = this.players();

        for (const player of players) {
            if (player instanceof WebRtcPlayer) {
                webRtcPlayers.push(player);
            }
        }

        return webRtcPlayers;
    });

    private negotiatorsSubscription: Subscription | undefined;
    private playersSubscription: Subscription | undefined;

    public constructor() {
        effect(() => {
            const room = this.room();
            const roomNetwork = room.roomConnection;

            this.negotiators.set([]);
            this.negotiatorsSubscription?.unsubscribe();
            this.negotiatorsSubscription = undefined;

            this.negotiatorsSubscription = roomNetwork.negotiators$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(negotiators => {
                this.negotiators.set(Array.from(negotiators.values()));
            });

            this.players.set([]);
            this.playersSubscription?.unsubscribe();
            this.playersSubscription = undefined;

            this.playersSubscription = room.players$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(players => {
                this.players.set(Array.from(players.values()));
            });
        });
    }
}
