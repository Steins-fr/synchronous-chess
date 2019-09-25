import { TestBed } from '@angular/core/testing';

import { PureWebrtcService } from './pure-webrtc.service';
import { skipWhile } from 'rxjs/operators';

describe('PureWebrtcService', () => {
    beforeEach(() => TestBed.configureTestingModule({
        providers: [PureWebrtcService]
    }));

    it('should be created', () => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);
        expect(service).toBeTruthy();
    });

    it('should configure WebRTC connection', (done: DoneFn) => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);
        service.configure();
        service.error.subscribe((errorMessage: string) => {
            expect(errorMessage).toBe('');
            done();
        });
    });

    it('should create WebRTC offer', (done: DoneFn) => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);
        service.createOffer();
        service.error.subscribe((errorMessage: string) => {
            expect(errorMessage).toBe('');
            done();
        });
    });

    it('should detect SDP parsing', (done: DoneFn) => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);
        service.createAnswer({
            sdp: {
                sdp: '',
                type: 'offer'
            },
            ice: []
        });

        service.error.pipe(skipWhile((e: string) => e === '')).subscribe((errorMessage: string) => {
            expect(errorMessage).not.toBe('');
            done();
        });
    });


    it('should create WebRTC answer', (done: DoneFn) => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);
        service.createAnswer({
            sdp: {
                type: 'offer',
                sdp: 'v=0\r\no=- 4403424112724198719 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:8/08\r\na=ice-pwd:fIrDQSTI74qHWkoSdFVeMws/\r\na=ice-options:trickle\r\na=fingerprint:sha-256 16:1C:E3:BD:32:C9:4B:28:7F:D3:CD:EC:29:B2:52:C5:F7:62:76:75:4F:F2:71:2B:7C:07:71:90:BF:CA:11:87\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n'
            },
            ice: []
        });

        service.error.subscribe((errorMessage: string) => {
            expect(errorMessage).toBe('');
            done();
        });
    });

    it('should not send a message without connection', () => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);

        expect(service.sendMessage('test')).toBeFalsy();
    });

    it('should not send a message without connection', () => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);

        service.registerRemoteSdp({
            type: 'offer',
            sdp: 'v=0\r\no=- 4403424112724198719 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:8/08\r\na=ice-pwd:fIrDQSTI74qHWkoSdFVeMws/\r\na=ice-options:trickle\r\na=fingerprint:sha-256 16:1C:E3:BD:32:C9:4B:28:7F:D3:CD:EC:29:B2:52:C5:F7:62:76:75:4F:F2:71:2B:7C:07:71:90:BF:CA:11:87\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n'
        });
        expect(service.sendMessage('test')).toBeFalsy();
    });

    it('should not send a message without connection', () => {
        const service: PureWebrtcService = TestBed.get(PureWebrtcService);

        service.registerRemoteIce([]);

        expect(service.sendMessage('test')).toBeFalsy();
    });

});
