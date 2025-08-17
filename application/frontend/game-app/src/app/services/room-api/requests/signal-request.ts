import { RtcSignal } from '@app/services/room-manager/classes/webrtc/webrtc';

export default interface SignalRequest {
    signal: RtcSignal;
    to: string;
    roomName: string;
}
