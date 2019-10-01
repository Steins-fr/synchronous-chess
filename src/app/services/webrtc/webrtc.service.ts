import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface Candidate {
    component?: any;
    type: string;
    foundation?: any;
    protocol?: any;
    address?: any;
    port?: any;
    priority?: any;
    elapsed: string;
}

export interface Signal {
    sdp: RTCSessionDescriptionInit;
    ice: Array<RTCIceCandidateInit>;
}

export interface WebrtcStates {
    error: string;
    ice: string;
    sendChannel: string;
    receiveChannel: string;
}

@Injectable()
export class WebrtcService {

    private static readonly defaultPeerConnectionConfig: RTCConfiguration = {
        iceServers: [
            {
                urls: [
                    'stun:stun.l.google.com:19302'
                ]
            }
        ]
    };

    private static readonly defaultSignal: Signal = {
        sdp: null,
        ice: []
    };

    private readonly _states: BehaviorSubject<WebrtcStates> = new BehaviorSubject<WebrtcStates>({
        error: '',
        ice: 'None',
        sendChannel: 'None',
        receiveChannel: 'None'
    });

    public states: Observable<WebrtcStates> = this._states.asObservable();

    private readonly _data: Subject<string> = new Subject<string>();
    public data: Observable<string> = this._data.asObservable();

    private _candidateEntries: Array<Candidate> = [];
    private readonly _candidates: Subject<Array<Candidate>> = new Subject<Array<Candidate>>();
    public candidates: Observable<Array<Candidate>> = this._candidates.asObservable();

    public peerConnection: RTCPeerConnection = undefined;
    public sendChannel: RTCDataChannel = undefined;
    public receiveChannel: RTCDataChannel = undefined;

    // Signals
    private _signal: Signal = {
        sdp: null,
        ice: []
    };

    private readonly _signalSubject: Subject<string> = new Subject<string>();
    public signal: Observable<string> = this._signalSubject.asObservable();

    private begin: number;

    public constructor(private readonly ngZone: NgZone) {
        this.configure();
    }

    public configure(peerConnectionConfig?: RTCConfiguration): void {
        this.peerConnection = new RTCPeerConnection(peerConnectionConfig || WebrtcService.defaultPeerConnectionConfig);
        this.peerConnection.onicecandidate = (e: any): void => this.gotIceCandidate(e);
        this.peerConnection.oniceconnectionstatechange = (): void => this.onIceConnectionStateChange();
        this.peerConnection.onicegatheringstatechange = (): void => this._gatheringStateChange();

        this.sendChannel = this.peerConnection.createDataChannel('sendDataChannel');

        this.sendChannel.onopen = (): void => this.onSendChannelStateChange();
        this.sendChannel.onclose = (): void => this.onSendChannelStateChange();

        this.peerConnection.ondatachannel = (e: any): void => this.receiveDataChannel(e);

        this._signal = WebrtcService.defaultSignal;

        this._candidateEntries = [];
    }

    public createOffer(options?: RTCOfferOptions): void {
        this.begin = window.performance.now();
        this.peerConnection.createOffer(options)
            .then((description: any): void => this.gotDescription(description));
    }

    public createAnswer(): void {
        this.begin = window.performance.now();
        this.peerConnection.createAnswer()
            .then((description: RTCSessionDescription) => this.gotDescription(description))
            .catch((e: any) => this.createError(e));
    }

    public sendMessage(message: string): boolean {
        if (this.sendChannel.readyState === 'open') {
            if (this.sendChannel) {
                this.sendChannel.send(message);
            }
            return true;
        }
        return false;
    }

    public registerSignal(signal: Signal): void {
        this.registerRemoteSdp(signal.sdp);
        this.registerRemoteIce(signal.ice);
    }

    private registerRemoteSdp(sdp: RTCSessionDescriptionInit): void {
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    private registerRemoteIce(ice: Array<RTCIceCandidateInit>): void {
        ice.forEach((iceCandidate: any): void => {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
        });
    }

    private onIceConnectionStateChange(): void {
        this.ngZone.run(() => this._states.next({
            ...this._states.getValue(),
            ice: this.peerConnection.iceConnectionState
        }));
    }

    private onSendChannelStateChange(): void {
        this.ngZone.run(() => this._states.next({
            ...this._states.getValue(),
            sendChannel: this.sendChannel.readyState
        }));
    }

    private onReceiveChannelStateChange(): void {
        this.ngZone.run(() => this._states.next({
            ...this._states.getValue(),
            receiveChannel: this.receiveChannel.readyState
        }));
    }

    private onReceiveMessage(event: any): void {
        this.ngZone.run(() => this._data.next(`Other: ${event.data}`));
    }

    private receiveDataChannel(event: any): void {
        this.receiveChannel = event.channel;
        this.receiveChannel.onmessage = (e: any): void => this.onReceiveMessage(e);
        this.receiveChannel.onopen = (): void => this.onReceiveChannelStateChange();
        this.receiveChannel.onclose = (): void => this.onReceiveChannelStateChange();
    }

    private createError(error: any): void {
        this.ngZone.run(() => this._states.next({
            ...this._states.getValue(),
            error
        }));
    }

    private gotDescription(description: RTCSessionDescription): void {
        this.peerConnection.setLocalDescription(description).then(
            () => {
                this._signal.sdp = description;
                // check icegathering
            }
        ).catch((e: any) => this.createError(e));
    }

    private gotIceCandidate(event: any): void {
        this._iceCallback(event);
        if (event.candidate !== null) {
            this._signal.ice.push(event.candidate);
        }
    }


    // Parse the uint32 PRIORITY field into its constituent parts from RFC 5245,
    // type preference, local preference, and (256 - component ID).
    // ex: 126 | 32252 | 255 (126 is host preference, 255 is component ID 1)
    private _formatPriority(priority: number): string {
        return [
            // tslint:disable-next-line: no-bitwise
            priority >> 24, (priority >> 8) & 0xFFFF, priority & 0xFF
        ].join(' | ');
    }

    private _iceCallback(event: any): void {
        const elapsed: string = ((window.performance.now() - this.begin) / 1000).toFixed(3);
        if (event.candidate) {
            if (event.candidate.candidate === '') {
                return;
            }
            let { candidate }: { candidate: Candidate } = event;

            candidate = {
                component: candidate.component,
                type: candidate.type,
                foundation: candidate.foundation,
                protocol: candidate.protocol,
                address: candidate.address,
                port: candidate.port,
                priority: this._formatPriority(candidate.priority),
                elapsed
            };

            this._candidateEntries.push(candidate);
        }
    }

    private _gatheringStateChange(): void {
        if (this.peerConnection.iceGatheringState !== 'complete') {
            return;
        }
        const elapsed: string = ((window.performance.now() - this.begin) / 1000).toFixed(3);
        const candidate: Candidate = {
            type: 'Done',
            elapsed
        };
        this._candidateEntries.push(candidate);
        this.ngZone.run(() => this._candidates.next([...this._candidateEntries]));

        this.ngZone.run(() => this._signalSubject.next(JSON.stringify(this._signal)));
    }
}
