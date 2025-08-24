/**
 * Interface for debugging Ice candidates.
 */
export interface DebugRTCIceCandidate extends RTCIceCandidate {
    priorities?: string;
    elapsed?: string;
}

export default interface WebrtcStates {
    error: string;
    iceConnection: RTCIceConnectionState;
    sendChannel: RTCDataChannelState;
    receiveChannel: RTCDataChannelState;
    iceGathering: RTCIceGatheringState;
    signaling: RTCSignalingState;
    candidates: Array<DebugRTCIceCandidate>;
}

export const defaultWebrtcStates: Readonly<WebrtcStates> = {
    error: '',
    iceConnection: 'new',
    sendChannel: 'connecting',
    receiveChannel: 'connecting',
    iceGathering: 'new',
    signaling: 'have-local-offer',
    candidates: []
};
