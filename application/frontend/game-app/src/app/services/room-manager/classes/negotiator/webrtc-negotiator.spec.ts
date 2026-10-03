import { WebrtcNegotiator } from './webrtc-negotiator';
import { Player } from '../player/player';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { RtcSignal } from '@protocol/rtc-signal';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { describe, expect, test, vi } from 'vitest';

describe('WebrtcNegotiator', () => {
    test('should send the signals through the peer', async () => {
        // Given
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const webrtcMock: WebrtcMock = new WebrtcMock();
        const peer = TestHelper.cast<Player>({ sendData: vi.fn() });
        const negotiator: WebrtcNegotiator = new WebrtcNegotiator('remote', webrtcMock.webrtc, peer);
        const signal: RtcSignal = { sdp: { sdp: 'sdp', type: 'offer' }, ice: [] };
        await negotiator.initiate();

        // When
        webrtcMock.rtcSignal$.next(signal);
        negotiator.clear();

        // Then
        expect(peer.sendData).toHaveBeenCalledWith({
            type: NegotiatorMessageType.SIGNAL,
            payload: { to: 'remote', signal },
            origin: MessageOriginType.NEGOTIATOR,
        });
        vi.restoreAllMocks();
    });
});
