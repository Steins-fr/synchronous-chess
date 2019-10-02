import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { WebrtcService, Signal } from 'src/app/services/webrtc/webrtc.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss'],
    providers: [WebrtcService]
})
export class ChatComponent implements OnInit, OnDestroy {

    private readonly subs: Array<Subscription> = [];

    @Input() public initiator: boolean = true;

    public signalInput: string = '';
    public sendInput: string = '';

    public chat: Array<string> = [];

    public constructor(public webRTC: WebrtcService) { }

    public ngOnInit(): void {
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
        if (this.initiator) {
            this.webRTC.createOffer();
        } else if (this.registerRemoteSdp()) {
            this.webRTC.createAnswer();
        }
    }

    public registerRemoteSdp(): boolean {
        try {
            this.webRTC.registerSignal(JSON.parse(this.signalInput));
            return true;
        } catch (e) {
            return false;
        }
    }
}
