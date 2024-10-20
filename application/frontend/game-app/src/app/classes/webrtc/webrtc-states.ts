/**
 * Interface for debugging Ice candidates.
 */
export interface DebugRTCIceCandidate extends RTCIceCandidate {
    priorities?: string;
    elapsed?: string;
}

export default class WebrtcStates {
    // FIXME: error type
    public error: unknown = '';
    public iceConnection: RTCIceConnectionState = 'new';
    public sendChannel: RTCDataChannelState = 'connecting';
    public receiveChannel: RTCDataChannelState = 'connecting';
    public iceGathering: RTCIceGatheringState = 'new';
    public signaling: RTCSignalingState = 'have-local-offer';
    public candidates: Array<DebugRTCIceCandidate> = [];  // Ice candidates (used for debugging)
}
