import { Component, ChangeDetectionStrategy, Input } from '@angular/core';

@Component({
    selector: 'app-debug-webrtc-states',
    templateUrl: './webrtc-states.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WebrtcStatesComponent {

    @Input() public stateIce: string;
    @Input() public stateSendChannel: string;
    @Input() public stateReceiveChannel: string;

    public constructor() { }

}
