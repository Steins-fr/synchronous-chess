import { Component, ChangeDetectionStrategy, Input, OnInit, OnDestroy, NgZone } from '@angular/core';
import { DebugRTCIceCandidate, Webrtc } from 'src/app/classes/webrtc/webrtc';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-debug-icecandidates',
    templateUrl: './icecandidates.component.html',
    changeDetection: ChangeDetectionStrategy.Default
})
export class IcecandidatesComponent implements OnInit, OnDestroy {

    @Input() public webRTC: Webrtc;
    @Input() public playerName: string;
    public candidates: Array<DebugRTCIceCandidate> = [];
    private sub: Subscription;

    public constructor(private readonly ngZone: NgZone) { }

    public ngOnInit(): void {
        this.sub = this.webRTC.iceCandidates.subscribe((c: Array<DebugRTCIceCandidate>) => {
            this.ngZone.run(() => this.candidates = c);
        });
    }

    public ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
        }
    }
}
