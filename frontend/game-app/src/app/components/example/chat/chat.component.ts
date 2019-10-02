import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebrtcService } from 'src/app/services/webrtc/webrtc.service';
import { Subscription } from 'rxjs';
import { WebSocketService, SocketState } from 'src/app/services/web-socket/web-socket.service';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss'],
    providers: [WebrtcService, WebSocketService]
})
export class ChatComponent implements OnInit, OnDestroy {

    private readonly subs: Array<Subscription> = [];

    public initiator: boolean = null;
    public autoNegotiate: boolean = false;

    public signalInput: string = '';
    public sendInput: string = '';

    public chat: Array<string> = [];

    public constructor(public webRTC: WebrtcService, public socket: WebSocketService) { }

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
        if (this.initiator) {
            this.webRTC.createOffer();
        } else {
            this.webRTC.createAnswer();
        }
    }

    public setMode(initiator: boolean, autoNegotiate: boolean): void {
        this.initiator = initiator;
        this.autoNegotiate = autoNegotiate;

        this.webRTC.configure(initiator);

        if (this.autoNegotiate) {
            this.socket.connect(new WebSocket(environment.webSocketServer));
            const sub: Subscription = this.socket.state.subscribe((state: SocketState) => {
                if (state === SocketState.OPEN) {
                    this.subs.push(this.webRTC.negotiate(this.socket));
                    sub.unsubscribe();
                }
            });
        }
    }

    public registerRemoteSignal(): void {
        this.webRTC.registerSignal(this.signalInput);
    }
}
