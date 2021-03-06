import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

import WebrtcStates, { DebugRTCIceCandidate } from './webrtc-states';

import { Message } from './messages/message';

export interface Signal {
    sdp: RTCSessionDescriptionInit;
    ice: Array<RTCIceCandidateInit>;
}

export enum WebrtcConnectionState {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    CHECKING = 'checking'
}

enum PacketType {
    MESSAGE = 'message',
    ACK = 'ack'
}

type PacketId = number;

interface Packet {
    id: PacketId;
    type: PacketType;
    nbTry?: number;
    message?: Message;
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

    private readonly packetIdGenerator: Generator = function* name(): Generator {
        let id: PacketId = 0;
        while (true) {
            yield ++id;
        }
    }();

    private readonly pendingAcknowledgement: Map<PacketId, NodeJS.Timer> = new Map<PacketId, NodeJS.Timer>();

    // WebRTC states observables
    private readonly _states: BehaviorSubject<WebrtcStates> = new BehaviorSubject<WebrtcStates>(new WebrtcStates());
    public states: Observable<WebrtcStates> = this._states.asObservable();

    // Observables for data received by DataChannel
    private readonly _data: Subject<Message> = new Subject<Message>();
    public data: Observable<Message> = this._data.asObservable();

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

        this.updateState(new WebrtcStates());

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
        this._states.next(Object.assign(new WebrtcStates(), { // Immutability for changesDetection
            ...this._states.getValue(),
            ...newState
        }));
    }

    private packetLost(packet: Packet): void {
        console.error(`Packet lost: ${packet.id}`, packet);

        if (packet.nbTry > 2) {
            return;
        }

        this.sendPacket({ ...packet });
    }

    private sendPacket(packet: Packet): void {
        if (packet.type !== PacketType.ACK) {
            packet.nbTry = packet.nbTry !== undefined ? packet.nbTry + 1 : 1;
            const timerId: NodeJS.Timer = setTimeout(() => this.packetLost(packet), 1000);
            this.pendingAcknowledgement.set(packet.id, timerId);
        }
        console.log('send packet', packet);

        if (this.sendChannel.readyState === 'open') {
            this.sendChannel.send(JSON.stringify(packet));
        }
    }

    public sendMessage(message: Message): void {
        this.sendPacket({
            id: this.packetIdGenerator.next().value,
            type: PacketType.MESSAGE,
            message
        });
    }

    private onReceiveMessage(event: MessageEvent): void {
        const packet: Packet = JSON.parse(event.data);
        console.log('received packet', packet);
        switch (packet.type) {
            case PacketType.MESSAGE:
                this._data.next(packet.message);
                this.sendPacket({ id: packet.id, type: PacketType.ACK });
                break;
            case PacketType.ACK:
                if (this.pendingAcknowledgement.has(packet.id)) {
                    clearTimeout(this.pendingAcknowledgement.get(packet.id));
                }
                break;
        }
    }

    private onDataChannel(event: RTCDataChannelEvent): void {
        this.receiveChannel = event.channel;
        this.receiveChannel.onmessage = (messageEvent: MessageEvent): void => this.onReceiveMessage(messageEvent);
        this.receiveChannel.onopen = (): void => this.onReceiveChannelStateChange();
        this.receiveChannel.onclose = (): void => this.onReceiveChannelStateChange();
    }

    private createError(error: any): void {
        this.updateState({ error });
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
        this.updateState({
            candidates: [...this._states.value.candidates, iceCandidate]
        });
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
