import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import WebrtcStates from 'src/app/classes/webrtc/webrtc-states';

@Component({
    selector: 'app-debug-webrtc-states',
    templateUrl: './webrtc-states.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WebrtcStatesComponent {
    @Input() public playerName: string;
    @Input() public states: WebrtcStates;
}
