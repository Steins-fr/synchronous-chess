import { RtcSignal } from '@app/services/room-manager/classes/webrtc/webrtc';

export default interface RtcSignalResponse {
    from: string;
    signal: RtcSignal;
}
