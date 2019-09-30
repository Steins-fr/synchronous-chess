import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { PureWebrtcService, Signal } from 'src/app/services/pure-webrtc.service';
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

    public webRTC: PureWebrtcService = new PureWebrtcService();
    public chat: Array<string> = [];

    public constructor(private readonly changeDetectorRef: ChangeDetectorRef) {

    }

    public ngOnInit(): void {
        this.subs.push(this.webRTC.eventDone
            .subscribe(() => {
                this.changeDetectorRef.detectChanges();
            }));

        this.subs.push(this.webRTC.data.subscribe((data: string) => this.chat.push(data)));
    }

    public ngOnDestroy(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
    }

    public sendMessage(): void {
        this.webRTC.sendMessage(this.sendInput);
        this.chat.push(`Me: ${this.sendInput}`);
        this.sendInput = '';
    }

    public start(): void {
        this.webRTC.configure();
        this.webRTC.createOffer();
    }

    public registerRemoteSdp(): void {
        const remoteSdp: Signal = JSON.parse(this.remoteSdpInput);

        this.webRTC.registerRemoteSdp(remoteSdp.sdp);
        this.webRTC.registerRemoteIce(remoteSdp.ice);
    }
}
