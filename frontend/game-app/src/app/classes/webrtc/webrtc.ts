import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import { WebSocketService, SocketPayload } from '../../services/web-socket/web-socket.service';

export interface Signal {
    sdp: RTCSessionDescriptionInit;
    ice: Array<RTCIceCandidateInit>;
}

/**
 * States of WebRTC channels and connection.
 */
export interface WebrtcStates {
    error: string;
    iceConnection: string;
    sendChannel: string;
    receiveChannel: string;
    iceGathering: string;
    signaling: string;
}

/**
 * Interface for debugging Ice candidates.
 */
export interface DebugRTCIceCandidate extends RTCIceCandidate {
    address?: string; // This property is not described in RTCIceCandidate but present
    priorities?: string;
    elapsed?: string;
}

export class Webrtc {
    /**
 * Configuration of the PeerConnection. Use google stun server for the moment.
 */
    private static readonly defaultPeerConnectionConfig: RTCConfiguration = {
        iceServers: [
            {
                urls: environment.iceServers
            }
        ]
    };

    private static readonly defaultStates: WebrtcStates = {
        error: '',
        iceConnection: 'None',
        sendChannel: 'None',
        receiveChannel: 'None',
        iceGathering: 'None',
        signaling: 'None'
    };

    // WebRTC states observables
    private readonly _states: BehaviorSubject<WebrtcStates> = new BehaviorSubject<WebrtcStates>(Webrtc.defaultStates);
    public states: Observable<WebrtcStates> = this._states.asObservable();

    // Observables for data received by DataChannel
    private readonly _data: Subject<string> = new Subject<string>();
    public data: Observable<string> = this._data.asObservable();

    // Ice candidates observables (used for debugging)
    private _iceCandidateEntries: Array<DebugRTCIceCandidate> = [];
    private readonly _iceCandidates: Subject<Array<DebugRTCIceCandidate>> = new Subject<Array<DebugRTCIceCandidate>>();
    public iceCandidates: Observable<Array<DebugRTCIceCandidate>> = this._iceCandidates.asObservable();

    // PeerConnection and full-duplex dataChannels
    public peerConnection: RTCPeerConnection = undefined;
    public sendChannel: RTCDataChannel = undefined;
    public receiveChannel: RTCDataChannel = undefined;

    // Signal variable and observables
    private _signal: Signal;
    private _signalSubject: Subject<Signal> = new Subject<Signal>();
    public signal: Observable<Signal> = this._signalSubject.asObservable();

    // Debug statistics, set at the beginning of ice gathering
    private begin: number;

    //private webSocket: Websocket = null;
    private initiator: boolean;

    public constructor() { }

    public configure(initiator: boolean, peerConnectionConfig?: RTCConfiguration): void {

        this.initiator = initiator;
        this.close();

        // Create PeerConnection and bind events
        this.peerConnection = new RTCPeerConnection(peerConnectionConfig || Webrtc.defaultPeerConnectionConfig);
        this.peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent): void => this.gotIceCandidate(event);
        this.peerConnection.oniceconnectionstatechange = (): void => this.onIceConnectionStateChange();
        this.peerConnection.onicegatheringstatechange = (): void => this.onIceGatheringStateChange();
        this.peerConnection.onsignalingstatechange = (): void => this.onSignalingStateChange();
        this.peerConnection.ondatachannel = (event: RTCDataChannelEvent): void => this.onDataChannel(event);

        // Create DataChannel for sending data and bind events
        this.sendChannel = this.peerConnection.createDataChannel('sendDataChannel');
        this.sendChannel.onopen = (): void => this.onSendChannelStateChange();
        this.sendChannel.onclose = (): void => this.onSendChannelStateChange();

        // Reinitialize signal object
        this._signal = {
            sdp: null,
            ice: []
        };
        this._signalSubject = new Subject<Signal>();
        this.signal = this._signalSubject.asObservable();

        this._iceCandidateEntries = [];
        this._iceCandidates.next([]);

        this._states.next(Webrtc.defaultStates);

        // Manually get states information
        this.onIceConnectionStateChange();
        this.onSendChannelStateChange();
        this.onSignalingStateChange();
    }

    public close(): void {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
    }

    public createOffer(options?: RTCOfferOptions): void {
        if (this.peerConnection) {
            this.begin = window.performance.now();
            this.peerConnection.createOffer(options)
                .then((description: any): void => this.gotDescription(description));
            this.initiator = true;
        }
    }

    public createAnswer(): void {
        if (this.peerConnection) {
            this.begin = window.performance.now();
            this.peerConnection.createAnswer()
                .then((description: RTCSessionDescription) => this.gotDescription(description))
                .catch((e: any) => this.createError(e));
            this.initiator = false;
        }
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

    public registerSignal(remoteSignal: Signal): boolean {
        try {
            if ((this.initiator && remoteSignal.sdp.type === 'answer')) {
                this.registerRemoteSdp(remoteSignal.sdp);
                this.registerRemoteIce(remoteSignal.ice);
            } else if (!this.initiator && remoteSignal.sdp.type === 'offer') {
                this.registerRemoteSdp(remoteSignal.sdp);
                this.registerRemoteIce(remoteSignal.ice);
                this.createAnswer();
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    private registerRemoteSdp(sdp: RTCSessionDescriptionInit): void {
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)).catch((e: any) => this.createError(e.message));
    }

    private registerRemoteIce(ice: Array<RTCIceCandidateInit>): void {
        ice.forEach((iceCandidate: any): void => {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
        });
    }

    private onIceConnectionStateChange(): void {
        this.updateState({ iceConnection: this.peerConnection.iceConnectionState });
    }

    private onSendChannelStateChange(): void {
        this.updateState({ sendChannel: this.sendChannel.readyState });
    }

    private onReceiveChannelStateChange(): void {
        this.updateState({ receiveChannel: this.receiveChannel.readyState });
    }

    private onSignalingStateChange(): void {
        this.updateState({ signaling: this.peerConnection.signalingState });
    }

    private updateState(newState: Partial<WebrtcStates>): void {
        this._states.next({
            ...this._states.getValue(),
            ...newState
        });
    }

    private onReceiveMessage(event: MessageEvent): void {
        this._data.next(event.data);
    }

    private onDataChannel(event: RTCDataChannelEvent): void {
        this.receiveChannel = event.channel;
        this.receiveChannel.onmessage = (messageEvent: MessageEvent): void => this.onReceiveMessage(messageEvent);
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
                this._signal.sdp = description;

                if (this.peerConnection.iceGatheringState === 'complete') {
                    this.onSignal();
                }
            }
        ).catch((e: any) => this.createError(e));
    }

    private onSignal(): void {
        this._signalSubject.next(this._signal);
    }

    private gotIceCandidate(event: RTCPeerConnectionIceEvent): void {

        if (event.candidate !== null) { // Gathering 'complete' send a null candidate
            const candidate: DebugRTCIceCandidate = event.candidate;
            this._signal.ice.push(event.candidate);

            this._iceDebug({
                ...candidate,
                component: candidate.component,
                type: candidate.type,
                foundation: candidate.foundation,
                protocol: candidate.protocol,
                address: candidate.address,
                priorities: this._formatPriority(candidate.priority),
                port: candidate.port
            });
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

    private _iceDebug(iceCandidate: DebugRTCIceCandidate): void {
        const elapsed: string = ((window.performance.now() - this.begin) / 1000).toFixed(3);

        iceCandidate.elapsed = elapsed;
        this._iceCandidateEntries.push(iceCandidate);
        this._iceCandidates.next([...this._iceCandidateEntries]);
    }

    private onIceGatheringStateChange(): void {
        this.updateState({ iceGathering: this.peerConnection.iceGatheringState });

        if (this.peerConnection.iceGatheringState !== 'complete') {
            return;
        }

        this._iceDebug({
            relatedAddress: 'Done'
        } as DebugRTCIceCandidate);

        this.onSignal();
    }
}
