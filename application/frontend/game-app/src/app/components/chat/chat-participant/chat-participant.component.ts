import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  ChangeDetectionStrategy,
  signal,
  OnChanges,
  SimpleChanges,
  input
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatChipsModule } from '@angular/material/chips';
import { Player } from '@app/classes/player/player';
import { WebRtcPlayer } from '@app/classes/player/web-rtc-player';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-chat-participant',
    templateUrl: './chat-participant.component.html',
    imports: [CommonModule, MatChipsModule],
    styleUrls: ['./chat-participant.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatParticipantComponent implements OnChanges {
    public readonly player = input.required<Player>();

    protected ping = signal<string>('');
    protected isMe = signal<boolean>(false);
    private pingSubscription: Subscription | undefined;

    private readonly destroyRef = inject(DestroyRef);

    public ngOnChanges(changes: SimpleChanges) {
        // FIXME: Rework this to use signals
        if (changes['player']) {
            this.pingSubscription?.unsubscribe();
            this.ping.set('');
            const player = this.player();
            if (player instanceof WebRtcPlayer) {
                this.isMe.set(false);
                this.pingSubscription = player.ping.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ping => {
                    this.ping.set(ping);
                });
            } else {
                this.isMe.set(true);
            }
        }
    }
}
