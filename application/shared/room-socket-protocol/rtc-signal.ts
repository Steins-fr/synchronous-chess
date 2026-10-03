// Structural copies of the DOM's RTCSessionDescriptionInit and RTCIceCandidateInit, so that the
// protocol does not depend on the DOM library: the API runs on Node

export interface RtcSessionDescription {
    type: 'answer' | 'offer' | 'pranswer' | 'rollback';
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
