/**
 * Interface for debugging Ice candidates.
 */
export interface DebugRTCIceCandidate extends RTCIceCandidate {
    priorities?: string;
    elapsed?: string;
}

export default class WebrtcStates {
    public error: any = '';
    public iceConnection: string = 'none';
    public sendChannel: string = 'none';
    public receiveChannel: string = 'none';
    public iceGathering: string = 'none';
    public signaling: string = 'none';
    public candidates: Array<DebugRTCIceCandidate> = [];  // Ice candidates (used for debugging)
}
