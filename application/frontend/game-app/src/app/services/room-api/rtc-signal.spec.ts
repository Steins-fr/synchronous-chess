// Specs of the protocol shared with the websocket API (application/shared/room-socket-protocol): it has
// no test runner of its own, the app's covers it
import { isRtcSignal } from '@protocol/rtc-signal';
import { describe, expect, test } from 'vitest';

const validSignal = {
    sdp: { type: 'offer', sdp: 'v=0' },
    ice: [
        { candidate: 'c1', sdpMid: '0', sdpMLineIndex: null, usernameFragment: 'u' },
        { sdpMLineIndex: 0, sdpMid: null, usernameFragment: null },
    ],
};

describe('isRtcSignal', () => {
    test('should accept a signal with the shape Webrtc reads', () => {
        expect(isRtcSignal(validSignal)).toBe(true);
        expect(isRtcSignal({ sdp: { type: 'rollback' }, ice: [] })).toBe(true);
    });

    test.each([
        ['nothing', undefined],
        ['null', null],
        ['a string', 'signal'],
        ['no description', { ice: [] }],
        ['a description that is not an object', { sdp: 'v=0', ice: [] }],
        ['an unknown description type', { sdp: { type: 'foo' }, ice: [] }],
        ['a description sdp that is not a string', { sdp: { type: 'offer', sdp: 42 }, ice: [] }],
        ['no candidates', { sdp: validSignal.sdp }],
        ['candidates that are not an array', { sdp: validSignal.sdp, ice: {} }],
        ['a null candidate', { sdp: validSignal.sdp, ice: [null] }],
        ['a candidate that is not an object', { sdp: validSignal.sdp, ice: [42] }],
        ['a candidate string that is not a string', { sdp: validSignal.sdp, ice: [{ candidate: 1, sdpMid: '0' }] }],
        ['a candidate sdpMid that is not a string', { sdp: validSignal.sdp, ice: [{ sdpMid: 0 }] }],
        ['a candidate sdpMLineIndex that is not a number', { sdp: validSignal.sdp, ice: [{ sdpMLineIndex: '0' }] }],
        ['a candidate usernameFragment that is not a string', { sdp: validSignal.sdp, ice: [{ sdpMid: '0', usernameFragment: 1 }] }],
        ['a candidate without sdpMid nor sdpMLineIndex', { sdp: validSignal.sdp, ice: [{ candidate: 'c1', sdpMid: null }] }],
    ])('should reject %s', (_name: string, signal: unknown) => {
        expect(isRtcSignal(signal)).toBe(false);
    });
});
