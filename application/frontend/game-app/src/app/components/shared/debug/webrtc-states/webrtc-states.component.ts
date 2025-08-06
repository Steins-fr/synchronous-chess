
import { Component, input } from '@angular/core';
import WebrtcStates from '@app/classes/webrtc/webrtc-states';

@Component({
    selector: 'app-debug-webrtc-states',
    templateUrl: './webrtc-states.component.html',
    imports: [],
})
export class WebrtcStatesComponent {
    public readonly playerName = input.required<string>();
    public readonly states = input.required<WebrtcStates | null>();
}
