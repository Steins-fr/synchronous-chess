import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Webrtc } from './webrtc';
import WebrtcStates from './webrtc-states';

const mockDataChannel = vi.fn();
const mockSetLocalDescription = vi.fn();
const mockSetRemoteDescription = vi.fn();
const mockCreateOffer = vi.fn();
const mockCreateAnswer = vi.fn();

const rtcPeerConnection = vi.fn(() => {
    return {
        createOffer: mockCreateOffer,
        createAnswer: mockCreateAnswer,
        setLocalDescription: mockSetLocalDescription,
        setRemoteDescription: mockSetRemoteDescription,
        addIceCandidate: vi.fn(),
        getStats: vi.fn(),
        onicecandidate: vi.fn(),
        ontrack: vi.fn(),
        createDataChannel: mockDataChannel,
    };
});

vi.stubGlobal('RTCPeerConnection', rtcPeerConnection);

const rtcRemoteDescription = vi.fn(() => {
    return {

    };
});

vi.stubGlobal('RTCSessionDescription', rtcRemoteDescription);

const rtcIceCandidate = vi.fn(() => {
    return {

    };
});

vi.stubGlobal('RTCIceCandidate', rtcIceCandidate);

describe('Webrtc', () => {
    beforeEach(() => {
        mockDataChannel.mockReturnValue({});
        mockSetLocalDescription.mockReturnValue(Promise.resolve());
        mockSetRemoteDescription.mockReturnValue(Promise.resolve());
        mockCreateOffer.mockReturnValue(Promise.resolve({
            sdp: 'mock-sdp',
            type: 'offer'
        }));
        mockCreateAnswer.mockReturnValue(Promise.resolve({
            sdp: 'mock-sdp',
            type: 'answer'
        }));
    });

    test('should configure WebRTC connection', () => new Promise<void>((done) => {
        const service: Webrtc = new Webrtc();
        service.configure(true);
        service.states.subscribe((states: WebrtcStates) => {
            expect(states.error).toBe('');
            done();
        });
    }));

    test('should create WebRTC offer', async () => {
        // Bad test
        const service: Webrtc = new Webrtc();
        service.configure(true);
        await service.createOffer();
        expect(mockCreateOffer).toHaveBeenCalled();
        expect(mockSetLocalDescription).toHaveBeenCalled();
    });

    test('should detect SDP parsing', async () => {
        const service: Webrtc = new Webrtc();
        mockSetRemoteDescription.mockReturnValue(Promise.reject(new Error('SDP parsing error')));
        service.configure(false);
        await service.registerSignal({
            sdp: {
                sdp: '',
                type: 'offer'
            },
            ice: []
        });
        const state = await firstValueFrom(service.states);
        expect(state.error).toBe('SDP parsing error');
    });


    test('should create WebRTC answer', async () => {
        const service: Webrtc = new Webrtc();
        service.configure(false);
        await service.registerSignal({
            sdp: {
                type: 'offer',
                sdp: 'v=0\r\no=- 4403424112724198719 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:8/08\r\na=ice-pwd:fIrDQSTI74qHWkoSdFVeMws/\r\na=ice-options:trickle\r\na=fingerprint:sha-256 16:1C:E3:BD:32:C9:4B:28:7F:D3:CD:EC:29:B2:52:C5:F7:62:76:75:4F:F2:71:2B:7C:07:71:90:BF:CA:11:87\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n'
            },
            ice: []
        });

        expect(mockCreateAnswer).toHaveBeenCalled();
        expect(mockSetLocalDescription).toHaveBeenCalled();
    });

    // test('should not send a message without connection', () => {
    //     const service: Webrtc = new Webrtc();
    //
    //     service.configure(true);
    //     //expect(service.sendMessage({ payload: 'test' })).toBeFalsy();
    // });
    //
    // test('should not send a message without connection 2', () => {
    //     const service: Webrtc = new Webrtc();
    //     service.configure(false);
    //     service.registerSignal({
    //         sdp: {
    //             type: 'offer',
    //             sdp: 'v=0\r\no=- 4403424112724198719 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:8/08\r\na=ice-pwd:fIrDQSTI74qHWkoSdFVeMws/\r\na=ice-options:trickle\r\na=fingerprint:sha-256 16:1C:E3:BD:32:C9:4B:28:7F:D3:CD:EC:29:B2:52:C5:F7:62:76:75:4F:F2:71:2B:7C:07:71:90:BF:CA:11:87\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n'
    //         },
    //         ice: []
    //     });
    //     //expect(service.sendMessage({ payload: 'test' })).toBeFalsy();
    // });
});
