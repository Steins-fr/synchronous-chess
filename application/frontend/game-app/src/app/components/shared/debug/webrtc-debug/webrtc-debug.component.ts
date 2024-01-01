import { CommonModule } from '@angular/common';
import {
    Component,
    inject,
    Signal,
    computed,
    signal,
    WritableSignal,
    effect,
    DestroyRef,
    ChangeDetectionStrategy,
    Input,
    OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Negotiator } from '@app/classes/negotiator/negotiator';
import { Player } from '@app/classes/player/player';
import { WebRtcPlayer } from '@app/classes/player/web-rtc-player';
import { RoomNetwork } from '@app/classes/room-network/room-network';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { WebrtcStatesComponent } from '@app/components/shared/debug/webrtc-states/webrtc-states.component';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-debug-webrtc',
    templateUrl: './webrtc-debug.component.html',
    standalone: true,
    imports: [CommonModule, WebrtcStatesComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebrtcDebugComponent<RoomServiceNotification extends RoomMessage> implements OnInit {
    private readonly destroyRef = inject(DestroyRef);

    @Input({ required: true }) room!: Room<RoomServiceNotification>;

    private readonly players: WritableSignal<Player[]> = signal([]);
    private readonly roomSocket: WritableSignal<RoomNetwork<RoomMessage> | undefined> = signal(undefined);
    protected readonly negotiators: WritableSignal<Negotiator[]> = signal([]);

    protected readonly webRtcPlayers: Signal<WebRtcPlayer[]> = computed(() => {
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
        }, { allowSignalWrites: true });
    }

    public ngOnInit(): void {
        this.room.players$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((players: Player[]) => {
            this.players.set(players);
        });

        this.room.roomConnection$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((roomManager: RoomNetwork<RoomMessage> | undefined) => {
            this.roomSocket.set(roomManager);
        });
    }
}
