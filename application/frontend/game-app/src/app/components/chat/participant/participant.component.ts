import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, NgZone, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatChipsModule } from '@angular/material/chips';
import { Player } from '@app/classes/player/player';

@Component({
    selector: 'app-chat-participant',
    templateUrl: './participant.component.html',
    standalone: true,
    imports: [CommonModule, MatChipsModule],
    styleUrls: ['./participant.component.scss']
})
export class ParticipantComponent implements OnInit {
    @Input({ required: true }) public player!: Player;

    public ping: string = '';

    private readonly destroyRef = inject(DestroyRef);

    public constructor(private readonly ngZone: NgZone) { }

    public ngOnInit(): void {
        this.player.ping.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((ping: string) => {
            this.ngZone.run(() => this.ping = ping);
        });
    }
}
