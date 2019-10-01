import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { WebrtcStates } from 'src/app/services/webrtc/webrtc.service';

@Component({
    selector: 'app-debug-webrtc-states',
    templateUrl: './webrtc-states.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WebrtcStatesComponent {
    @Input() public states: WebrtcStates;
}
