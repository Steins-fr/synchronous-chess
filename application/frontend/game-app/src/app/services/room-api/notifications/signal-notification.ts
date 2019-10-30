import { Signal } from 'src/app/classes/webrtc/webrtc';

export default interface SignalNotification {
    from: string;
    signal: Signal;
}
