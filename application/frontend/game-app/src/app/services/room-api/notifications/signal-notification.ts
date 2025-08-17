import { RtcSignal } from '@app/services/room-manager/classes/webrtc/webrtc';

export default interface SignalNotification {
    from: string;
    signal: RtcSignal;
}
