import { Signal } from '../../../classes/webrtc/webrtc';

export default interface SignalResponse {
    from: string;
    signal: Signal;
}
