import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Candidate } from 'src/app/services/pure-webrtc.service';

@Component({
    selector: 'app-debug-icecandidates',
    templateUrl: './icecandidates.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class IcecandidatesComponent {

    @Input() public candidates: Array<Candidate>;

    public constructor() { }
}
