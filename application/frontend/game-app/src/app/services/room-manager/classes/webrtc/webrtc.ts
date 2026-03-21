import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '@environments/environment';
import WebrtcStates, { DebugRTCIceCandidate, defaultWebrtcStates } from './webrtc-states';

import { Message } from './messages/message';

export interface RtcSignal {
    sdp: RTCSessionDescriptionInit;
    ice: Array<RTCIceCandidateInit>;
}

enum PacketType {
    MESSAGE = 'message',
    ACK = 'ack'
}

type PacketId = number;

interface Packet {
    id: PacketId;
    type: PacketType;
    nbTry: number;
    message?: Message;
}

export class Webrtc {
    /**
     * Configuration of the PeerConnection. Use Google stun server for the moment.
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
            ++id;
            yield id;
        }
    }();

    private readonly pendingAcknowledgement = new Map<PacketId, ReturnType<typeof setTimeout>>();

    // WebRTC states observables
    private readonly _states = new BehaviorSubject<Readonly<WebrtcStates>>(defaultWebrtcStates);
    public readonly states = this._states.asObservable();

    // Observables for data received by DataChannel
    private readonly _data: Subject<Message> = new Subject<Message>();
    public readonly data: Observable<Message> = this._data.asObservable();

    // PeerConnection and full-duplex dataChannels
    // The peerConnection is created when the offer is created. It may be reset when retrying the connection
    private _peerConnection?: RTCPeerConnection = undefined;
    // The channel are created when the candidate gathering is complete
    private _sendChannel?: RTCDataChannel = undefined;
    private _receiveChannel?: RTCDataChannel = undefined;

    public get peerConnection(): RTCPeerConnection {
        if (!this._peerConnection) {
            throw new Error('PeerConnection not initialized');
        }

        return this._peerConnection;
    }

    public get sendChannel(): RTCDataChannel {
        if (!this._sendChannel) {
            throw new Error('SendChannel not initialized');
        }

        return this._sendChannel;
    }

    public get receiveChannel(): RTCDataChannel {
        if (!this._receiveChannel) {
            throw new Error('ReceiveChannel not initialized');
        }

        return this._receiveChannel;
    }

    // Signal variable and observables
    private _rtcSignal: RtcSignal = {
        sdp: {
            sdp: '',
            type: 'offer',
        },
        ice: []
    };
    private _rtcSignalSubject: Subject<RtcSignal> = new Subject<RtcSignal>();
    public rtcSignal$: Observable<RtcSignal> = this._rtcSignalSubject.asObservable();

    // Debug statistics, set at the beginning of ice gathering
    private begin: number = 0;

    //private webSocket: Websocket = null;
    private initiator: boolean = false;

    public configure(initiator: boolean, peerConnectionConfig?: RTCConfiguration): void {

        this.initiator = initiator;
        if (this._peerConnection) {
            this.close();
        }

        // Create PeerConnection and bind events
        this._peerConnection = new RTCPeerConnection(peerConnectionConfig ?? Webrtc.defaultPeerConnectionConfig);
        this.peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent): void => this.gotIceCandidate(event);
        this.peerConnection.oniceconnectionstatechange = (): void => this.onIceConnectionStateChange();
        this.peerConnection.onicegatheringstatechange = (): void => this.onIceGatheringStateChange();
        this.peerConnection.onsignalingstatechange = (): void => this.onSignalingStateChange();
        this.peerConnection.ondatachannel = (event: RTCDataChannelEvent): void => this.onDataChannel(event);

        // Create DataChannel for sending data and bind events
        this._sendChannel = this.peerConnection.createDataChannel('sendDataChannel');
        this.sendChannel.onopen = (): void => this.onSendChannelStateChange();
        this.sendChannel.onclose = (): void => this.onSendChannelStateChange();

        // Reinitialize signal object
        this._rtcSignal = {
            sdp: {
                sdp: '',
                type: 'offer',
            },
            ice: []
        };
        this._rtcSignalSubject = new Subject<RtcSignal>();
        this.rtcSignal$ = this._rtcSignalSubject.asObservable();

        this.updateState(defaultWebrtcStates);

        // Manually get states information
        this.onIceConnectionStateChange();
        this.onSendChannelStateChange();
        this.onSignalingStateChange();
    }

    public close(): void {
        this.peerConnection.close();
    }

    public async createOffer(options?: RTCOfferOptions): Promise<void> {
        this.begin = window.performance.now();
        this.initiator = true;

        try {
            const description = await this.peerConnection.createOffer(options);
            await this.gotDescription(description);
        } catch (e: unknown) {
            this.createError(e);
        }
    }

    public async createAnswer(): Promise<void> {
        this.begin = window.performance.now();
        this.initiator = false;

        const description = await this.peerConnection.createAnswer();
        await this.gotDescription(description);
    }

    public async registerSignal(remoteSignal: RtcSignal): Promise<void> {
        if ((this.initiator && remoteSignal.sdp.type === 'answer')) {
            this.registerRemoteSdp(remoteSignal.sdp);
            await this.registerRemoteIce(remoteSignal.ice);
        } else if (!this.initiator && remoteSignal.sdp.type === 'offer') {
            this.registerRemoteSdp(remoteSignal.sdp);
            await this.registerRemoteIce(remoteSignal.ice);
            await this.createAnswer();
        }
    }

    private registerRemoteSdp(sdp: RTCSessionDescriptionInit): void {
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)).catch(e => this.createError(e.message));
    }

    private async registerRemoteIce(candidates: RTCIceCandidateInit[]): Promise<void> {
        for (const candidate of candidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
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

    private packetLost(packet: Packet): void {
        console.error(`Packet lost: ${packet.id}`, packet);

        if (packet.nbTry > 2) {
            return;
        }

        this.sendPacket({ ...packet });
    }

    private sendPacket(packet: Packet): void {
        if (packet.type !== PacketType.ACK) {
            packet.nbTry = packet.nbTry + 1;
            const timerId = setTimeout(() => this.packetLost(packet), 1000);
            this.pendingAcknowledgement.set(packet.id, timerId);
        }

        if (this.sendChannel.readyState === 'open') {
            this.sendChannel.send(JSON.stringify(packet));
        }
    }

    public sendMessage(message: Message): number {
        const id: number = this.packetIdGenerator.next().value;
        this.sendPacket({
            id,
            type: PacketType.MESSAGE,
            nbTry: 0,
            message
        });

        return id;
    }

    private onReceiveMessage(event: MessageEvent): void {
        const packet: Packet = JSON.parse(event.data);
        switch (packet.type) {
            case PacketType.MESSAGE:
                if (!packet.message) {
                    throw new Error('Message is undefined');
                }

                this.onNewMessage(packet.message);
                this.sendPacket({ id: packet.id, type: PacketType.ACK, nbTry: 0 });
                break;
            case PacketType.ACK:
                if (this.pendingAcknowledgement.has(packet.id)) {
                    clearTimeout(this.pendingAcknowledgement.get(packet.id));
                }
                break;
        }
    }

    protected onNewMessage(message: Message): void {
        this._data.next(message);
    }

    private onDataChannel(event: RTCDataChannelEvent): void {
        this._receiveChannel = event.channel;
        this.receiveChannel.onmessage = (messageEvent: MessageEvent): void => this.onReceiveMessage(messageEvent);
        this.receiveChannel.onopen = (): void => this.onReceiveChannelStateChange();
        this.receiveChannel.onclose = (): void => this.onReceiveChannelStateChange();
    }

    private createError(error: unknown): void {
        console.error('WebRTC error', error);

        this.updateState({ error: String(error) });
    }

    private async gotDescription(description: RTCSessionDescriptionInit): Promise<void> {
        await this.peerConnection.setLocalDescription(description);

        this._rtcSignal.sdp = description;

        if (this.peerConnection.iceGatheringState === 'complete') {
            this.onSignal();
        }
    }

    private onSignal(): void {
        this._rtcSignalSubject.next(this._rtcSignal);
    }

    private gotIceCandidate(event: RTCPeerConnectionIceEvent): void {

        if (event.candidate !== null) { // Gathering 'complete' send a null candidate
            const candidate = event.candidate;
            this._rtcSignal.ice.push(event.candidate);

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
    private _formatPriority(priority: number | null): string {
        if (priority === null) {
            return '';
        }

        return [
            // tslint:disable-next-line: no-bitwise
            priority >> 24, (priority >> 8) & 0xFFFF, priority & 0xFF
        ].join(' | ');
    }

    private _iceDebug(iceCandidate: DebugRTCIceCandidate): void {
        iceCandidate.elapsed = ((window.performance.now() - this.begin) / 1000).toFixed(3);
        this.updateState({
            candidates: [...this._states.value.candidates, iceCandidate]
        });
    }

    private onIceGatheringStateChange(): void {
        this.updateState({ iceGathering: this.peerConnection.iceGatheringState });

        if (this.peerConnection.iceGatheringState !== 'complete') {
            return;
        }

        this.onSignal();
    }
}
