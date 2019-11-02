import { Component, Input, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Player } from 'src/app/classes/player/player';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-chat-participant',
    templateUrl: './participant.component.html',
    styleUrls: ['./participant.component.scss']
})
export class ParticipantComponent implements OnInit, OnDestroy {

    @Input() public player: Player;
    public ping: string = '';
    private sub: Subscription;

    public constructor(private readonly ngZone: NgZone) { }

    public ngOnInit(): void {
        this.sub = this.player.ping.subscribe((ping: string) => {
            this.ngZone.run(() => this.ping = ping);
        });
    }

    public ngOnDestroy(): void {
        if (this.sub !== undefined) {
            this.sub.unsubscribe();
        }
    }
}
