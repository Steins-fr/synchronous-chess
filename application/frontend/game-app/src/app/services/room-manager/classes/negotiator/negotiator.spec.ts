import { Negotiator, NegotiatorConnectionState } from './negotiator';
import { RtcSignal } from '@protocol/rtc-signal';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class TestNegotiator extends Negotiator {
    public readonly handleSignalSpy = vi.fn();

    protected handleSignal(signal: RtcSignal): void {
        this.handleSignalSpy(signal);
    }
}

const signal: RtcSignal = { sdp: { sdp: 'sdp', type: 'offer' }, ice: [] };

function createNegotiator(): { negotiator: TestNegotiator; webrtcMock: WebrtcMock; states: NegotiatorConnectionState[] } {
    const webrtcMock: WebrtcMock = new WebrtcMock();
    const negotiator: TestNegotiator = new TestNegotiator('remote', webrtcMock.webrtc);
    const states: NegotiatorConnectionState[] = [];
    negotiator.connectionState$.subscribe((state: NegotiatorConnectionState) => states.push(state));
    return { negotiator, webrtcMock, states };
}

describe('Negotiator', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('initiate should configure the connection and create an offer', async () => {
        // Given
        const { negotiator, webrtcMock } = createNegotiator();

        // When
        await negotiator.initiate();
        webrtcMock.rtcSignal$.next(signal);

        // Then
        expect(negotiator.isInitiator).toEqual(true);
        expect(negotiator.states).toBe(webrtcMock.states);
        expect(webrtcMock.configure).toHaveBeenCalledWith(true);
        expect(webrtcMock.createOffer).toHaveBeenCalledTimes(1);
        expect(negotiator.handleSignalSpy).toHaveBeenCalledWith(signal);
    });

    test('should disconnect after the negotiation timeout', () => {
        // Given
        const { negotiator, states } = createNegotiator();

        // When
        vi.advanceTimersByTime(15000);
        negotiator.clear();

        // Then
        expect(states).toEqual([NegotiatorConnectionState.DISCONNECTED]);
    });

    test('clear should cancel the negotiation timeout', () => {
        // Given
        const { negotiator, states } = createNegotiator();
        let completed: boolean = false;
        negotiator.connectionState$.subscribe({ complete: () => completed = true });

        // When
        negotiator.clear();
        vi.advanceTimersByTime(15000);

        // Then
        expect(states).toEqual([]);
        expect(completed).toEqual(true);
    });

    test('should be connected once the ice connection and both channels are ready', async () => {
        // Given
        const { negotiator, webrtcMock, states } = createNegotiator();
        await negotiator.initiate();

        // When
        webrtcMock.emitStates({ iceConnection: 'disconnected' });
        webrtcMock.emitStates({ iceConnection: 'checking' });
        webrtcMock.emitStates({ iceConnection: 'connected', sendChannel: 'open', receiveChannel: 'connecting' });
        webrtcMock.emitStates({ iceConnection: 'connected', sendChannel: 'connecting', receiveChannel: 'open' });

        // Then
        expect(states).toEqual([]);

        // When
        webrtcMock.emitStates({ iceConnection: 'connected', sendChannel: 'open', receiveChannel: 'open' });
        webrtcMock.emitStates({ iceConnection: 'connected' });

        // Then
        expect(states).toEqual([NegotiatorConnectionState.CONNECTED]);
    });

    test('negotiationMessage should ignore signals from other players', async () => {
        // Given
        const { negotiator, webrtcMock } = createNegotiator();

        // When
        await negotiator.negotiationMessage({ from: 'other', signal });

        // Then
        expect(webrtcMock.configure).not.toHaveBeenCalled();
        expect(webrtcMock.registerSignal).not.toHaveBeenCalled();
    });

    test('negotiationMessage should setup the connection of a non initiator', async () => {
        // Given
        const { negotiator, webrtcMock } = createNegotiator();

        // When
        await negotiator.negotiationMessage({ from: 'remote', signal });

        // Then
        expect(webrtcMock.configure).toHaveBeenCalledWith(false);
        expect(webrtcMock.createOffer).not.toHaveBeenCalled();
        expect(webrtcMock.registerSignal).toHaveBeenCalledWith(signal);
    });

    test('negotiationMessage should only register the signal for an initiator', async () => {
        // Given
        const { negotiator, webrtcMock } = createNegotiator();
        await negotiator.initiate();

        // When
        await negotiator.negotiationMessage({ from: 'remote', signal });

        // Then
        expect(webrtcMock.configure).toHaveBeenCalledTimes(1);
        expect(webrtcMock.registerSignal).toHaveBeenCalledWith(signal);
    });

    test('should retry the connection and give up after too many signals', async () => {
        // Given
        const { negotiator, webrtcMock, states } = createNegotiator();
        await negotiator.negotiationMessage({ from: 'remote', signal });

        // When
        webrtcMock.rtcSignal$.next(signal);
        await negotiator.negotiationMessage({ from: 'remote', signal });
        webrtcMock.rtcSignal$.next(signal);
        webrtcMock.rtcSignal$.next(signal);
        await negotiator.negotiationMessage({ from: 'remote', signal });

        // Then
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(webrtcMock.configure).toHaveBeenCalledTimes(2);
        expect(states).toEqual([NegotiatorConnectionState.DISCONNECTED]);
    });
});
