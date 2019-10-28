import { Signal } from 'src/app/classes/webrtc/webrtc';

export default interface SignalRequest {
    signal: Signal;
    to: string;
    roomName: string;
}
