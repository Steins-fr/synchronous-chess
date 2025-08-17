import { CommonModule } from '@angular/common';
import {
    Component,
    DestroyRef,
    OnInit,
    computed,
    effect,
    inject,
    input,
    signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Negotiator } from '@app/services/room-manager/classes/negotiator/negotiator';
import { Player } from '@app/services/room-manager/classes/player/player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { RoomNetwork } from '@app/services/room-manager/classes/room-network/room-network';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subscription } from 'rxjs';
import { WebrtcStatesComponent } from '../webrtc-states/webrtc-states.component';

@Component({
    selector: 'app-debug-webrtc',
    templateUrl: './webrtc-debug.component.html',
    imports: [CommonModule, WebrtcStatesComponent],
})
export class WebrtcDebugComponent<RoomServiceNotification extends RoomMessage> implements OnInit {
    private readonly destroyRef = inject(DestroyRef);

    public readonly room = input.required<Room<RoomServiceNotification>>();

    private readonly players = signal<Player[]>([]);
    private readonly roomSocket = signal<RoomNetwork<RoomMessage> | undefined>(undefined);
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

    public constructor() {
        effect(() => {
            const roomSocket = this.roomSocket();

            this.negotiators.set([]);
            this.negotiatorsSubscription?.unsubscribe();
            this.negotiatorsSubscription = undefined;

            if (roomSocket) {
                this.negotiatorsSubscription = roomSocket.negotiators$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(negotiators => {
                    this.negotiators.set(negotiators);
                });
            }
        });
    }

    public ngOnInit(): void {
        this.room().players$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((players: Player[]) => {
            this.players.set(players);
        });

        this.room().roomConnection$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((roomManager: RoomNetwork<RoomMessage> | undefined) => {
            this.roomSocket.set(roomManager);
        });
    }
}
