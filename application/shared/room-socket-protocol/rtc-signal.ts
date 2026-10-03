// Structural copies of the DOM's RTCSessionDescriptionInit and RTCIceCandidateInit, so that the
// protocol does not depend on the DOM library: the API runs on Node. The app's specs check that they
// still match the DOM types

const RTC_SDP_TYPES = ['answer', 'offer', 'pranswer', 'rollback'] as const;

export type RtcSdpType = typeof RTC_SDP_TYPES[number];

export interface RtcSessionDescription {
    type: RtcSdpType;
    sdp?: string;
}

export interface RtcIceCandidateInit {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
}

/** A candidate the remote peer can register: the RTCIceCandidate constructor throws without sdpMid nor sdpMLineIndex */
export type RtcIceCandidate = RtcIceCandidateInit & ({ sdpMid: string } | { sdpMLineIndex: number });

/** The WebRTC session description and ICE candidates a peer relays to another through the websocket API */
export interface RtcSignal {
    sdp: RtcSessionDescription;
    ice: RtcIceCandidate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isOptional(value: unknown, type: 'string' | 'number'): boolean {
    return value === undefined || typeof value === type;
}

function isNullable(value: unknown, type: 'string' | 'number'): boolean {
    return value === null || isOptional(value, type);
}

function isRtcSessionDescription(value: unknown): value is RtcSessionDescription {
    return isRecord(value)
        && (RTC_SDP_TYPES as readonly unknown[]).includes(value['type'])
        && isOptional(value['sdp'], 'string');
}

export function isRtcIceCandidate(value: unknown): value is RtcIceCandidate {
    return isRecord(value)
        && isOptional(value['candidate'], 'string')
        && isNullable(value['sdpMid'], 'string')
        && isNullable(value['sdpMLineIndex'], 'number')
        && isNullable(value['usernameFragment'], 'string')
        && (typeof value['sdpMid'] === 'string' || typeof value['sdpMLineIndex'] === 'number');
}

/** Whether a signal received from the network has the shape that Webrtc reads, before it is relayed or registered */
export function isRtcSignal(value: unknown): value is RtcSignal {
    return isRecord(value)
        && isRtcSessionDescription(value['sdp'])
        && Array.isArray(value['ice'])
        && value['ice'].every(isRtcIceCandidate);
}
