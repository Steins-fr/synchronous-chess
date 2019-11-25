import { Signal } from '../../../classes/webrtc/webrtc';

export default interface SignalNotification {
    from: string;
    signal: Signal;
}
