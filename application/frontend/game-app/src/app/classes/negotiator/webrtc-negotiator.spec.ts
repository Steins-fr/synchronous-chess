import { WebrtcNegotiator } from './webrtc-negotiator';
import { Webrtc } from '../webrtc/webrtc';

describe('WebrtcNegotiator', () => {
    it('should create an instance', () => {
        expect(new WebrtcNegotiator('', '', new Webrtc(), undefined)).toBeTruthy();
    });
});
