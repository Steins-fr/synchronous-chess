import { WebrtcNegotiator } from './webrtc-negotiator';
import { Webrtc } from '../webrtc/webrtc';
import { PlayerType } from '../player/player';

describe('WebrtcNegotiator', () => {
    it('should create an instance', () => {
        expect(new WebrtcNegotiator('', PlayerType.HOST, new Webrtc(), undefined)).toBeTruthy();
    });
});
