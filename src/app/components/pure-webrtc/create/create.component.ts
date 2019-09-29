import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { PureWebrtcService, SessionDescription } from 'src/app/services/pure-webrtc.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-pure-webrtc-create',
    templateUrl: './create.component.html',
    styleUrls: ['./create.component.scss'],
    providers: [PureWebrtcService]
})
export class CreateComponent implements OnInit, OnDestroy {

    private readonly subs: Array<Subscription> = [];

    public remoteSdpInput: string = '';
    public sendInput: string = '';

    public webRTCChat: PureWebrtcService = new PureWebrtcService();

    public constructor(private readonly changeDetectorRef: ChangeDetectorRef) {

    }

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
        this.webRTCChat.configure();
        this.webRTCChat.createOffer();
    }

    public registerRemoteSdp(): void {
        const remoteSdp: SessionDescription = JSON.parse(this.remoteSdpInput);

        this.webRTCChat.registerRemoteSdp(remoteSdp.sdp);
        this.webRTCChat.registerRemoteIce(remoteSdp.ice);
    }
}
