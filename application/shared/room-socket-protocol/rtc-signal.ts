/** The WebRTC session description and ICE candidates a peer relays to another through the websocket API */
export interface RtcSignal {
    sdp: RTCSessionDescriptionInit;
    ice: RTCIceCandidateInit[];
}
