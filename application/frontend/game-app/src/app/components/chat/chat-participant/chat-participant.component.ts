
import {
    Component,
    DestroyRef,
    effect,
    inject,
    input,
    signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatChipsModule } from '@angular/material/chips';
import { Player } from '@app/classes/player/player';
import { WebRtcPlayer } from '@app/classes/player/web-rtc-player';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-chat-participant',
    templateUrl: './chat-participant.component.html',
    imports: [MatChipsModule],
    styleUrls: ['./chat-participant.component.scss'],
})
export class ChatParticipantComponent {
    public readonly player = input.required<Player>();

    protected ping = signal<string>('');
    protected isMe = signal<boolean>(false);
    private pingSubscription: Subscription | undefined;

    private readonly destroyRef = inject(DestroyRef);

    public constructor() {
        effect(() => {
            const player = this.player();

            this.pingSubscription?.unsubscribe();
            this.ping.set('');
            if (player instanceof WebRtcPlayer) {
                this.isMe.set(false);
                this.pingSubscription = player.ping.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ping => {
                    this.ping.set(ping);
                });
            } else {
                this.isMe.set(true);
            }
        });
    }
}
