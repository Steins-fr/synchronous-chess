// Structural copies of the DOM's RTCSessionDescriptionInit and RTCIceCandidateInit, so that the
// protocol does not depend on the DOM library: the API runs on Node. The app checks at compile time
// that they still match the DOM types

const RTC_SDP_TYPES = ['answer', 'offer', 'pranswer', 'rollback'] as const;

export type RtcSdpType = typeof RTC_SDP_TYPES[number];

export interface RtcSessionDescription {
    type: RtcSdpType;
    sdp?: string;
}

export interface RtcIceCandidate {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
}

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

function isRtcIceCandidate(value: unknown): value is RtcIceCandidate {
    return isRecord(value)
        && isOptional(value['candidate'], 'string')
        && isNullable(value['sdpMid'], 'string')
        && isNullable(value['sdpMLineIndex'], 'number')
        && isNullable(value['usernameFragment'], 'string')
        // The RTCIceCandidate constructor throws without both
        && (value['sdpMid'] != null || value['sdpMLineIndex'] != null);
}

/** Whether a signal received from the network has the shape that Webrtc reads, before it is relayed or registered */
export function isRtcSignal(value: unknown): value is RtcSignal {
    return isRecord(value)
        && isRtcSessionDescription(value['sdp'])
        && Array.isArray(value['ice'])
        && value['ice'].every(isRtcIceCandidate);
}
