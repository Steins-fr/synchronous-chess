import { RtcSignal } from '@app/classes/webrtc/webrtc';

export default interface SignalRequest {
    signal: RtcSignal;
    to: string;
    roomName: string;
}
