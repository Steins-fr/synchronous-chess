import { Webrtc } from './webrtc';
import { skipWhile } from 'rxjs/operators';
import WebrtcStates from './webrtc-states';

describe('Webrtc', () => {
    it('should create an instance', () => {
        expect(new Webrtc()).toBeTruthy();
    });

    it('should configure WebRTC connection', (done: DoneFn) => {
        const service: Webrtc = new Webrtc();
        service.configure(true);
        service.states.subscribe((states: WebrtcStates) => {
            expect(states.error).toBe('');
            done();
        });
    });

    it('should create WebRTC offer', (done: DoneFn) => {
        // Bad test
        const service: Webrtc = new Webrtc();
        service.configure(true);
        service.createOffer();
        service.states.subscribe((states: WebrtcStates) => {
            expect(states.error).toBe('');
            done();
        });
    });

    it('should detect SDP parsing', (done: DoneFn) => {
        const service: Webrtc = new Webrtc();
        service.configure(false);
        service.registerSignal({
            sdp: {
                sdp: '',
                type: 'offer'
            },
            ice: []
        });

        service.states.pipe(skipWhile((states: WebrtcStates) => states.error === '')).subscribe((states: WebrtcStates) => {
            expect(states.error).not.toBe('');
            done();
        });
    });


    it('should create WebRTC answer', (done: DoneFn) => {
        const service: Webrtc = new Webrtc();
        service.configure(false);
        service.registerSignal({
            sdp: {
                type: 'offer',
                sdp: 'v=0\r\no=- 4403424112724198719 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:8/08\r\na=ice-pwd:fIrDQSTI74qHWkoSdFVeMws/\r\na=ice-options:trickle\r\na=fingerprint:sha-256 16:1C:E3:BD:32:C9:4B:28:7F:D3:CD:EC:29:B2:52:C5:F7:62:76:75:4F:F2:71:2B:7C:07:71:90:BF:CA:11:87\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n'
            },
            ice: []
        });

        service.states.subscribe((states: WebrtcStates) => {
            expect(states.error).toBe('');
            done();
        });
    });

    // it('should not send a message without connection', () => {
    //     const service: Webrtc = new Webrtc();
    //
    //     service.configure(true);
    //     //expect(service.sendMessage({ payload: 'test' })).toBeFalsy();
    // });
    //
    // it('should not send a message without connection 2', () => {
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
