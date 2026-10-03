import { RtcSignal } from '../rtc-signal';

export default interface SignalNotification {
    from: string;
    signal: RtcSignal;
}
