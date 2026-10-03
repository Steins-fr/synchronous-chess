import { environment } from '@environments/environment';
import { RtcSignal } from '@protocol/rtc-signal';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Message } from './messages/message';
import { Webrtc } from './webrtc';
import WebrtcStates from './webrtc-states';

class MockRTCDataChannel {
    public readyState: RTCDataChannelState = 'connecting';
    public send = vi.fn();
    public onopen?: () => void;
    public onclose?: () => void;
    public onmessage?: (event: { data: string }) => void;
}

class MockRTCPeerConnection {
    public static instances: MockRTCPeerConnection[] = [];

    public iceConnectionState: RTCIceConnectionState = 'new';
    public iceGatheringState: RTCIceGatheringState = 'new';
    public signalingState: RTCSignalingState = 'stable';
    public readonly sendChannel = new MockRTCDataChannel();

    public createOffer = vi.fn().mockResolvedValue({ sdp: 'offer-sdp', type: 'offer' });
    public createAnswer = vi.fn().mockResolvedValue({ sdp: 'answer-sdp', type: 'answer' });
    public setLocalDescription = vi.fn().mockResolvedValue(undefined);
    public setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    public addIceCandidate = vi.fn().mockResolvedValue(undefined);
    public close = vi.fn();
    public createDataChannel = vi.fn(() => this.sendChannel);

    public onicecandidate?: (event: { candidate: Partial<RTCIceCandidate> | null }) => void;
    public oniceconnectionstatechange?: () => void;
    public onicegatheringstatechange?: () => void;
    public onsignalingstatechange?: () => void;
    public ondatachannel?: (event: { channel: MockRTCDataChannel }) => void;

    public constructor(public readonly configuration: RTCConfiguration) {
        MockRTCPeerConnection.instances.push(this);
    }
}

class MockRTCSessionDescription {
    public constructor(public readonly init: RTCSessionDescriptionInit) {}
}

class MockRTCIceCandidate {
    public constructor(public readonly init: RTCIceCandidateInit) {}
}

function lastPeerConnection(): MockRTCPeerConnection {
    return MockRTCPeerConnection.instances[MockRTCPeerConnection.instances.length - 1];
}

function openReceiveChannel(): MockRTCDataChannel {
    const receiveChannel = new MockRTCDataChannel();
    lastPeerConnection().ondatachannel?.({ channel: receiveChannel });
    return receiveChannel;
}

async function currentStates(webrtc: Webrtc): Promise<WebrtcStates> {
    return firstValueFrom(webrtc.states);
}

const offerSignal: RtcSignal = { sdp: { sdp: 'remote', type: 'offer' }, ice: [{ candidate: 'c1', sdpMid: '0' }, { candidate: 'c2', sdpMLineIndex: 0 }] };
const answerSignal: RtcSignal = { sdp: { sdp: 'remote', type: 'answer' }, ice: [{ candidate: 'c1', sdpMid: '0' }] };

describe('Webrtc', () => {
    beforeEach(() => {
        MockRTCPeerConnection.instances = [];
        vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
        vi.stubGlobal('RTCSessionDescription', MockRTCSessionDescription);
        vi.stubGlobal('RTCIceCandidate', MockRTCIceCandidate);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('should throw when accessing the connection before configuration', () => {
        // Given
        const webrtc: Webrtc = new Webrtc();

        // When / Then
        expect(() => webrtc.peerConnection).toThrow('PeerConnection not initialized');
        expect(() => webrtc.sendChannel).toThrow('SendChannel not initialized');
        expect(() => webrtc.receiveChannel).toThrow('ReceiveChannel not initialized');
    });

    test('should configure WebRTC connection', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();

        // When
        webrtc.configure(true);

        // Then
        const states: WebrtcStates = await currentStates(webrtc);
        expect(lastPeerConnection().configuration).toEqual({ iceServers: [{ urls: environment.iceServers }] });
        expect(webrtc.sendChannel).toBe(lastPeerConnection().sendChannel);
        expect(states.error).toBe('');
        expect(states.iceConnection).toBe('new');
        expect(states.signaling).toBe('stable');
    });

    test('should close the previous connection when configured again', () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        const configuration: RTCConfiguration = { iceServers: [] };
        webrtc.configure(true);
        const previous: MockRTCPeerConnection = lastPeerConnection();

        // When
        webrtc.configure(false, configuration);

        // Then
        expect(previous.close).toHaveBeenCalledTimes(1);
        expect(lastPeerConnection()).not.toBe(previous);
        expect(lastPeerConnection().configuration).toBe(configuration);
    });

    test('should follow the peer connection states', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const peerConnection: MockRTCPeerConnection = lastPeerConnection();

        // When
        peerConnection.iceConnectionState = 'connected';
        peerConnection.oniceconnectionstatechange?.();
        peerConnection.signalingState = 'have-local-offer';
        peerConnection.onsignalingstatechange?.();
        peerConnection.sendChannel.readyState = 'open';
        peerConnection.sendChannel.onopen?.();
        peerConnection.iceGatheringState = 'gathering';
        peerConnection.onicegatheringstatechange?.();
        const receiveChannel: MockRTCDataChannel = openReceiveChannel();
        receiveChannel.readyState = 'open';
        receiveChannel.onopen?.();

        // Then
        const states: WebrtcStates = await currentStates(webrtc);
        expect(states.iceConnection).toBe('connected');
        expect(states.signaling).toBe('have-local-offer');
        expect(states.sendChannel).toBe('open');
        expect(states.iceGathering).toBe('gathering');
        expect(states.receiveChannel).toBe('open');

        // When
        peerConnection.sendChannel.readyState = 'closed';
        peerConnection.sendChannel.onclose?.();
        receiveChannel.readyState = 'closed';
        receiveChannel.onclose?.();

        // Then
        const closedStates: WebrtcStates = await currentStates(webrtc);
        expect(closedStates.sendChannel).toBe('closed');
        expect(closedStates.receiveChannel).toBe('closed');
    });

    test('should close the connection', () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);

        // When
        webrtc.close();

        // Then
        expect(lastPeerConnection().close).toHaveBeenCalledTimes(1);
    });

    test('should create WebRTC offer and wait for the ice gathering', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const peerConnection: MockRTCPeerConnection = lastPeerConnection();
        const signals: RtcSignal[] = [];
        webrtc.rtcSignal$.subscribe((signal: RtcSignal) => signals.push(signal));

        // When
        await webrtc.createOffer();

        // Then
        expect(peerConnection.setLocalDescription).toHaveBeenCalledWith({ sdp: 'offer-sdp', type: 'offer' });
        expect(signals).toEqual([]);

        // When
        peerConnection.iceGatheringState = 'complete';
        peerConnection.onicegatheringstatechange?.();

        // Then
        expect(signals).toEqual([{ sdp: { sdp: 'offer-sdp', type: 'offer' }, ice: [] }]);
    });

    test('should send the signal directly if the ice gathering is already complete', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        lastPeerConnection().iceGatheringState = 'complete';
        const signals: RtcSignal[] = [];
        webrtc.rtcSignal$.subscribe((signal: RtcSignal) => signals.push(signal));

        // When
        await webrtc.createOffer();

        // Then
        expect(signals).toHaveLength(1);
    });

    test('should report offer creation errors', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        lastPeerConnection().createOffer.mockRejectedValue('offer failure');

        // When
        await webrtc.createOffer();

        // Then
        expect((await currentStates(webrtc)).error).toBe('offer failure');
    });

    test('should collect ice candidates', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const peerConnection: MockRTCPeerConnection = lastPeerConnection();
        const signals: RtcSignal[] = [];
        webrtc.rtcSignal$.subscribe((signal: RtcSignal) => signals.push(signal));
        const candidate: Partial<RTCIceCandidate> = { candidate: 'c1', priority: 2122260223, port: 1234 };
        const candidateWithoutPriority: Partial<RTCIceCandidate> = { candidate: 'c2', priority: null };

        // When
        peerConnection.onicecandidate?.({ candidate });
        peerConnection.onicecandidate?.({ candidate: candidateWithoutPriority });
        peerConnection.onicecandidate?.({ candidate: null });
        peerConnection.iceGatheringState = 'complete';
        peerConnection.onicegatheringstatechange?.();

        // Then
        const states: WebrtcStates = await currentStates(webrtc);
        expect(states.candidates).toHaveLength(2);
        expect(states.candidates[0].priorities).toBe('126 | 32542 | 255');
        expect(states.candidates[0].elapsed).toMatch(/^-?\d+\.\d{3}$/);
        expect(states.candidates[1].priorities).toBe('');
        expect(signals[0].ice).toEqual([candidate, candidateWithoutPriority]);
    });

    test('should register the answer of an initiator', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const peerConnection: MockRTCPeerConnection = lastPeerConnection();

        // When
        await webrtc.registerSignal(offerSignal);

        // Then
        expect(peerConnection.setRemoteDescription).not.toHaveBeenCalled();

        // When
        await webrtc.registerSignal(answerSignal);

        // Then
        expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith(new MockRTCSessionDescription(answerSignal.sdp));
        expect(peerConnection.addIceCandidate).toHaveBeenCalledTimes(1);
        expect(peerConnection.createAnswer).not.toHaveBeenCalled();
    });

    test('should answer the offer of an initiator', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(false);
        const peerConnection: MockRTCPeerConnection = lastPeerConnection();

        // When
        await webrtc.registerSignal(answerSignal);

        // Then
        expect(peerConnection.setRemoteDescription).not.toHaveBeenCalled();

        // When
        await webrtc.registerSignal(offerSignal);

        // Then
        expect(peerConnection.addIceCandidate).toHaveBeenCalledTimes(2);
        expect(peerConnection.createAnswer).toHaveBeenCalledTimes(1);
        expect(peerConnection.setLocalDescription).toHaveBeenCalledWith({ sdp: 'answer-sdp', type: 'answer' });
    });

    test('should reject a malformed remote signal', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(false);
        const peerConnection: MockRTCPeerConnection = lastPeerConnection();
        const malformedSignal = { sdp: { sdp: 'remote', type: 'offer' }, ice: [null] } as unknown as RtcSignal;

        // When
        await webrtc.registerSignal(malformedSignal);

        // Then
        expect(peerConnection.setRemoteDescription).not.toHaveBeenCalled();
        expect(peerConnection.addIceCandidate).not.toHaveBeenCalled();
        expect((await currentStates(webrtc)).error).toBe('Invalid remote signal');
    });

    test('should detect SDP parsing', async () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(false);
        lastPeerConnection().setRemoteDescription.mockRejectedValue(new Error('SDP parsing error'));

        // When
        await webrtc.registerSignal({ sdp: { sdp: '', type: 'offer' }, ice: [] });

        // Then
        expect((await currentStates(webrtc)).error).toBe('SDP parsing error');
    });

    test('should send messages only on an open channel', () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const sendChannel: MockRTCDataChannel = lastPeerConnection().sendChannel;

        // When
        const firstId: number = webrtc.sendMessage({ payload: 'closed' });
        sendChannel.readyState = 'open';
        const secondId: number = webrtc.sendMessage({ payload: 'open' });

        // Then
        expect(secondId).toEqual(firstId + 1);
        expect(sendChannel.send).toHaveBeenCalledTimes(1);
        expect(JSON.parse(sendChannel.send.mock.calls[0][0])).toEqual({ id: secondId, type: 'message', nbTry: 1, message: { payload: 'open' } });
    });

    test('should resend a lost packet three times at most', () => {
        // Given
        vi.useFakeTimers();
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const sendChannel: MockRTCDataChannel = lastPeerConnection().sendChannel;
        sendChannel.readyState = 'open';

        // When
        webrtc.sendMessage({ payload: 'lost' });
        vi.advanceTimersByTime(5000);

        // Then
        expect(sendChannel.send).toHaveBeenCalledTimes(3);
        expect(console.error).toHaveBeenCalledTimes(3);
    });

    test('should not resend an acknowledged packet', () => {
        // Given
        vi.useFakeTimers();
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(true);
        const sendChannel: MockRTCDataChannel = lastPeerConnection().sendChannel;
        sendChannel.readyState = 'open';
        const receiveChannel: MockRTCDataChannel = openReceiveChannel();

        // When
        const id: number = webrtc.sendMessage({ payload: 'acknowledged' });
        receiveChannel.onmessage?.({ data: JSON.stringify({ id, type: 'ack', nbTry: 0 }) });
        receiveChannel.onmessage?.({ data: JSON.stringify({ id: id + 100, type: 'ack', nbTry: 0 }) });
        vi.advanceTimersByTime(5000);

        // Then
        expect(sendChannel.send).toHaveBeenCalledTimes(1);
    });

    test('should emit received messages and acknowledge them', () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(false);
        const sendChannel: MockRTCDataChannel = lastPeerConnection().sendChannel;
        sendChannel.readyState = 'open';
        const receiveChannel: MockRTCDataChannel = openReceiveChannel();
        const messages: Message[] = [];
        webrtc.data.subscribe((message: Message) => messages.push(message));

        // When
        receiveChannel.onmessage?.({ data: JSON.stringify({ id: 7, type: 'message', nbTry: 1, message: { payload: 'hello' } }) });

        // Then
        expect(messages).toEqual([{ payload: 'hello' }]);
        expect(JSON.parse(sendChannel.send.mock.calls[0][0])).toEqual({ id: 7, type: 'ack', nbTry: 0 });
    });

    test('should throw on invalid received packets', () => {
        // Given
        const webrtc: Webrtc = new Webrtc();
        webrtc.configure(false);
        const receiveChannel: MockRTCDataChannel = openReceiveChannel();

        // When
        const withoutMessage = (): void => receiveChannel.onmessage?.({ data: JSON.stringify({ id: 1, type: 'message', nbTry: 1 }) });
        const unknownType = (): void => receiveChannel.onmessage?.({ data: JSON.stringify({ id: 1, type: 'unknown', nbTry: 1 }) });

        // Then
        expect(withoutMessage).toThrow('Message is undefined');
        expect(unknownType).toThrow('Unhandled switch case: unknown');
    });
});
