import { RtcSignal } from '../rtc-signal';

export default interface RtcSignalResponse {
    from: string;
    signal: RtcSignal;
}
