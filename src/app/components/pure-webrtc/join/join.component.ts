import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { PureWebrtcService, Signal } from 'src/app/services/pure-webrtc.service';
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

    public webRTC: PureWebrtcService = new PureWebrtcService();
    public chat: Array<string> = [];

    public constructor(private readonly changeDetectorRef: ChangeDetectorRef) { }

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
        const remoteOffer: Signal = JSON.parse(this.remoteSdpInput);

        this.webRTC.configure();
        this.webRTC.createAnswer(remoteOffer);
    }
}
