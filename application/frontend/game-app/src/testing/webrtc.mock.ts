import { Message } from '@app/services/room-manager/classes/webrtc/messages/message';
import { RtcSignal, Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import WebrtcStates, { defaultWebrtcStates } from '@app/services/room-manager/classes/webrtc/webrtc-states';
import { BehaviorSubject, Subject } from 'rxjs';
import { vi } from 'vitest';
import { TestHelper } from './test.helper';

/**
 * Controllable replacement of Webrtc: states, data and signals are pushed by the test
 */
export class WebrtcMock {
    public readonly states = new BehaviorSubject<WebrtcStates>(defaultWebrtcStates);
    public readonly data = new Subject<Message>();
    public readonly rtcSignal$ = new Subject<RtcSignal>();

    public readonly configure = vi.fn();
    public readonly createOffer = vi.fn().mockResolvedValue(undefined);
    public readonly registerSignal = vi.fn().mockResolvedValue(undefined);
    public readonly sendMessage = vi.fn().mockReturnValue(1);
    public readonly close = vi.fn();

    public get webrtc(): Webrtc {
        return TestHelper.cast<Webrtc>(this);
    }

    public emitStates(states: Partial<WebrtcStates>): void {
        this.states.next({ ...this.states.getValue(), ...states });
    }
}
