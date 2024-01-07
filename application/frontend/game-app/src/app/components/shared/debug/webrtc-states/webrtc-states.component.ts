import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import WebrtcStates from '@app/classes/webrtc/webrtc-states';

@Component({
    selector: 'app-debug-webrtc-states',
    templateUrl: './webrtc-states.component.html',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebrtcStatesComponent {
    @Input({ required: true }) public playerName!: string;
    @Input({ required: true }) public states!: WebrtcStates | null;
}
