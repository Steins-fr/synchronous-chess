import { Component, ChangeDetectionStrategy, Input, NgZone, OnInit, OnDestroy } from '@angular/core';
import { WebrtcStates, Webrtc } from 'src/app/classes/webrtc/webrtc';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-debug-webrtc-states',
    templateUrl: './webrtc-states.component.html',
    changeDetection: ChangeDetectionStrategy.Default
})
export class WebrtcStatesComponent implements OnInit, OnDestroy {

    @Input() public webRTC: Webrtc;
    @Input() public playerName: string;
    public states: WebrtcStates;
    private sub: Subscription;

    public constructor(private readonly ngZone: NgZone) { }

    public ngOnInit(): void {
        this.sub = this.webRTC.states.subscribe((s: WebrtcStates) => {
            this.ngZone.run(() => this.states = s);
        });
    }

    public ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
        }
    }
}
