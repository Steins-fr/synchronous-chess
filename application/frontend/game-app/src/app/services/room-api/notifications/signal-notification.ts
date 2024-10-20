import { RtcSignal } from '@app/classes/webrtc/webrtc';

export default interface SignalNotification {
    from: string;
    signal: RtcSignal;
}
