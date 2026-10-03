import { RtcSignal } from '../rtc-signal';

export default interface RtcSignalRequest {
    roomName: string;
    to: string; // Player name (destination)
    signal: RtcSignal;
}
