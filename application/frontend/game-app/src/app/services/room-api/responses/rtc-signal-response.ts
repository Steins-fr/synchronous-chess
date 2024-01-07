import { RtcSignal } from '@app/classes/webrtc/webrtc';

export default interface RtcSignalResponse {
    from: string;
    signal: RtcSignal;
}
