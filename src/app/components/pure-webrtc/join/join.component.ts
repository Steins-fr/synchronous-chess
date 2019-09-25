import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { PureWebrtcService, SessionDescription } from 'src/app/services/pure-webrtc.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-pure-webrtc-join',
    templateUrl: './join.component.html',
    styleUrls: ['./join.component.scss'],
    providers: [PureWebrtcService]
})
export class JoinComponent implements OnInit, OnDestroy {

    private readonly subs: Array<Subscription> = [];

    public sendInput: string = '';
    public remoteSdpInput: string = '';

    public webRTCChat: PureWebrtcService = new PureWebrtcService();

    public constructor(private readonly changeDetectorRef: ChangeDetectorRef) { }

    public ngOnInit(): void {
        this.subs.push(this.webRTCChat.eventDone
            .subscribe(() => {
                this.changeDetectorRef.detectChanges();
            }));
    }

    public ngOnDestroy(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
    }

    public sendMessage(): void {
        this.webRTCChat.sendMessage(this.sendInput);
        this.sendInput = '';
    }

    public start(): void {
        const remoteOffer: SessionDescription = JSON.parse(this.remoteSdpInput);
        this.webRTCChat.createAnswer(remoteOffer);
    }
}
