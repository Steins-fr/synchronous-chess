import { CommonModule } from '@angular/common';
import {
    Component,
    Input,
    DestroyRef,
    inject,
    ChangeDetectionStrategy,
    signal,
    OnChanges,
    SimpleChanges, NgZone
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatChipsModule } from '@angular/material/chips';
import { Player } from '@app/classes/player/player';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-chat-participant',
    templateUrl: './chat-participant.component.html',
    standalone: true,
    imports: [CommonModule, MatChipsModule],
    styleUrls: ['./chat-participant.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatParticipantComponent implements OnChanges {
    @Input({ required: true }) public player!: Player;

    protected ping = signal<string>('');
    private pingSubscription: Subscription | undefined;

    private readonly destroyRef = inject(DestroyRef);
    private readonly zone = inject(NgZone);

    public ngOnChanges(changes: SimpleChanges) {
        if (changes['player']) {
            this.pingSubscription?.unsubscribe();
            this.ping.set('');
            this.pingSubscription = this.player.ping.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ping => {
                this.ping.set(ping);
            });
        }
    }
}
