import { Signal } from 'src/app/classes/webrtc/webrtc';

export default interface SignalResponse {
    from: string;
    signal: Signal;
}
