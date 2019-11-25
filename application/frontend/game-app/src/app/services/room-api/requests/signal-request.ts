import { Signal } from '../../../classes/webrtc/webrtc';

export default interface SignalRequest {
    signal: Signal;
    to: string;
    roomName: string;
}
