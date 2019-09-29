import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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

export interface SessionDescription {
    sdp: RTCSessionDescriptionInit;
    ice: Array<RTCIceCandidateInit>;
}

interface WebrtcStates {
    error: string;
    ice: string;
    sendChannel: string;
    receiveChannel: string;
}

@Injectable()
export class PureWebrtcService {

    private static readonly defaultPeerConnectionConfig: RTCConfiguration = {
        iceServers: [
            {
                urls: [
                    'stun:stun.l.google.com:19302'
                ]
            }
        ]
    };

    private static readonly defaultSessionDescription: SessionDescription = {
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


    private readonly _chatEntries: Array<string> = [];
    private readonly _chat: BehaviorSubject<Array<string>> = new BehaviorSubject<Array<string>>([]);
    public chat: Observable<Array<string>> = this._chat.asObservable();

    private _candidateEntries: Array<Candidate> = [];
    private readonly _candidates: BehaviorSubject<Array<Candidate>> = new BehaviorSubject<Array<Candidate>>([]);
    public candidates: Observable<Array<Candidate>> = this._candidates.asObservable();

    public peerConnection: RTCPeerConnection = undefined;
    public sendChannel: RTCDataChannel = undefined;
    public receiveChannel: RTCDataChannel = undefined;

    public description: SessionDescription = {
        sdp: null,
        ice: []
    };

    private readonly _sessionDescription: BehaviorSubject<string> = new BehaviorSubject<string>('');
    public sessionDescription: Observable<string> = this._sessionDescription.asObservable();

    private readonly _eventDone: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    public eventDone: Observable<boolean> = this._eventDone.asObservable();

    private begin: number;

    public constructor() {
        this.configure();
    }

    public configure(peerConnectionConfig?: RTCConfiguration): void {
        this.peerConnection = new RTCPeerConnection(peerConnectionConfig || PureWebrtcService.defaultPeerConnectionConfig);
        this.peerConnection.onicecandidate = (e: any): void => this.gotIceCandidate(e);
        this.peerConnection.oniceconnectionstatechange = (): void => this.onIceConnectionStateChange();
        this.peerConnection.onicegatheringstatechange = (): void => this._gatheringStateChange();

        this.sendChannel = this.peerConnection.createDataChannel('sendDataChannel');

        this.sendChannel.onopen = (): void => this.onSendChannelStateChange();
        this.sendChannel.onclose = (): void => this.onSendChannelStateChange();

        this.peerConnection.ondatachannel = (e: any): void => this.receiveDataChannel(e);

        this.description = PureWebrtcService.defaultSessionDescription;
        this._sessionDescription.next('');

        this._candidateEntries = [];
        this._candidates.next(this._candidateEntries);

        this.onEventDone();
    }

    public createOffer(options?: RTCOfferOptions): void {
        this.begin = window.performance.now();
        this.peerConnection.createOffer(options)
            .then((description: any): void => this.gotDescription(description));
    }

    public createAnswer(remoteOffer: SessionDescription): void {
        this.begin = window.performance.now();
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer.sdp)).then(
            () => {
                if (remoteOffer.sdp.type === 'offer') {
                    this.peerConnection.createAnswer()
                        .then((description: RTCSessionDescription) => this.gotDescription(description))
                        .catch((e: any) => this.createError(e));
                }
            })
            .catch((e: any) => this.createError(e));

        this.registerRemoteIce(remoteOffer.ice);
    }

    public sendMessage(message: string): boolean {
        if (this.sendChannel.readyState === 'open') {
            this._chatEntries.push(`Me: ${message}`);
            this._chat.next(this._chatEntries);
            if (this.sendChannel) {
                this.sendChannel.send(message);
            }
            this.onEventDone();
            return true;
        }
        return false;
    }

    public registerRemoteSdp(sdp: RTCSessionDescriptionInit): void {
        if (sdp) {
            this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        }
    }

    public registerRemoteIce(ice: Array<RTCIceCandidateInit>): void {
        if (ice && ice.length > 0) {
            ice.forEach((iceCandidate: any): void => {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
            });
        }
    }

    private onEventDone(): void {
        this._eventDone.next(true);
    }

    private onIceConnectionStateChange(): void {
        this._states.next({
            ...this._states.getValue(),
            ice: this.peerConnection.iceConnectionState
        });
        this.onEventDone();
    }

    private onSendChannelStateChange(): void {
        this._states.next({
            ...this._states.getValue(),
            sendChannel: this.sendChannel.readyState
        });
        this.onEventDone();
    }

    private onReceiveChannelStateChange(): void {
        this._states.next({
            ...this._states.getValue(),
            receiveChannel: this.receiveChannel.readyState
        });
        this.onEventDone();
    }

    private onReceiveMessage(event: any): void {
        this._chatEntries.push(`Other: ${event.data}`);
        this._chat.next(this._chatEntries);
        this.onEventDone();
    }

    private receiveDataChannel(event: any): void {
        this.receiveChannel = event.channel;
        this.receiveChannel.onmessage = (e: any): void => this.onReceiveMessage(e);
        this.receiveChannel.onopen = (): void => this.onReceiveChannelStateChange();
        this.receiveChannel.onclose = (): void => this.onReceiveChannelStateChange();
    }

    private createError(error: any): void {
        this._states.next({
            ...this._states.getValue(),
            error
        });
    }

    private gotDescription(description: RTCSessionDescription): void {
        this.peerConnection.setLocalDescription(description).then(
            () => {
                this.description.sdp = description;
                this._sessionDescription.next(JSON.stringify(this.description));
                this.onEventDone();
            }
        ).catch((e: any) => this.createError(e));
    }

    private gotIceCandidate(event: any): void {
        this._iceCallback(event);
        if (event.candidate !== null) {
            this.description.ice.push(event.candidate);
            this._sessionDescription.next(JSON.stringify(this.description));
            this.onEventDone();
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
            this._candidates.next([...this._candidateEntries]);
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
        this._candidates.next([...this._candidateEntries]);
        this.onEventDone();
    }
}
