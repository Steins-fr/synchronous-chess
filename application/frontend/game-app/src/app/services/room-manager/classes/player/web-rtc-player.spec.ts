import { WebRtcPlayer } from './web-rtc-player';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { PlayerMessage, PlayerMessageType } from '@app/services/room-manager/classes/webrtc/messages/player-message';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const blockChainMessage: NetworkMessage = {
    type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
    payload: null,
    origin: MessageOriginType.BLOCK_ROOM_SERVICE,
    chain: BlockChainName.CHESS,
};

function createPlayer(): { player: WebRtcPlayer; webrtcMock: WebrtcMock } {
    const webrtcMock: WebrtcMock = new WebrtcMock();
    const player: WebRtcPlayer = new WebRtcPlayer('remote', webrtcMock.webrtc);
    return { player, webrtcMock };
}

describe('WebRtcPlayer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(TimedLogger, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should be a remote player exposing the connection states', () => {
        // Given
        const { player, webrtcMock } = createPlayer();

        // When / Then
        expect(player.isLocal).toEqual(false);
        expect(player.states).toBe(webrtcMock.states);
        player.clear();
    });

    test('sendData should send the message and only log non player messages', () => {
        // Given
        const { player, webrtcMock } = createPlayer();
        const pingMessage: PlayerMessage = { type: PlayerMessageType.PING, origin: MessageOriginType.PLAYER, payload: 'mark' };

        // When
        player.sendData(pingMessage);
        player.sendData(blockChainMessage);

        // Then
        expect(webrtcMock.sendMessage).toHaveBeenCalledWith(pingMessage);
        expect(webrtcMock.sendMessage).toHaveBeenCalledWith(blockChainMessage);
        expect(TimedLogger.log).toHaveBeenCalledTimes(1);
        player.clear();
    });

    test('should ping the peer periodically', () => {
        // Given
        const markSpy = vi.spyOn(window.performance, 'mark').mockImplementation(() => TestHelper.cast<PerformanceMark>({}));
        const { player, webrtcMock } = createPlayer();

        // When
        vi.advanceTimersByTime(5000);

        // Then
        expect(markSpy).toHaveBeenCalledWith('pingMark-remote-1');
        expect(webrtcMock.sendMessage).toHaveBeenLastCalledWith({ type: PlayerMessageType.PING, origin: MessageOriginType.PLAYER, payload: 'remote-2' });
        player.clear();
    });

    test('should notify the disconnection of the peer', () => {
        // Given
        const { player, webrtcMock } = createPlayer();
        const disconnectedSpy = vi.fn();
        player.disconnected$.subscribe(disconnectedSpy);

        // When
        webrtcMock.emitStates({ iceConnection: 'connected' });
        webrtcMock.emitStates({ iceConnection: 'connected' });
        webrtcMock.emitStates({ iceConnection: 'checking' });
        webrtcMock.emitStates({ iceConnection: 'disconnected' });

        // Then
        expect(disconnectedSpy).toHaveBeenCalledTimes(1);
        player.clear();
    });

    test('should answer the ping of the peer', () => {
        // Given
        const { player, webrtcMock } = createPlayer();

        // When
        webrtcMock.data.next({ type: PlayerMessageType.PING, origin: MessageOriginType.PLAYER, payload: 'other-1' } as PlayerMessage);

        // Then
        expect(webrtcMock.sendMessage).toHaveBeenCalledWith({ type: PlayerMessageType.PONG, origin: MessageOriginType.PLAYER, payload: 'other-1' });
        player.clear();
    });

    test('should measure the ping on pong', () => {
        // Given
        vi.spyOn(window.performance, 'mark').mockImplementation(() => TestHelper.cast<PerformanceMark>({}));
        vi.spyOn(window.performance, 'measure').mockImplementation(() => TestHelper.cast<PerformanceMeasure>({}));
        const getEntriesSpy = vi.spyOn(window.performance, 'getEntriesByName')
            .mockReturnValueOnce([TestHelper.cast<PerformanceEntry>({ duration: 30 })])
            .mockReturnValueOnce([]);
        const clearMarksSpy = vi.spyOn(window.performance, 'clearMarks').mockImplementation(() => undefined);
        const clearMeasuresSpy = vi.spyOn(window.performance, 'clearMeasures').mockImplementation(() => undefined);
        const { player, webrtcMock } = createPlayer();
        const pings: string[] = [];
        player.ping.subscribe((ping: string) => pings.push(ping));

        // When
        webrtcMock.data.next({ type: PlayerMessageType.PONG, origin: MessageOriginType.PLAYER, payload: 'remote-1' } as PlayerMessage);
        webrtcMock.data.next({ type: PlayerMessageType.PONG, origin: MessageOriginType.PLAYER, payload: 'remote-2' } as PlayerMessage);

        // Then
        expect(pings).toEqual(['', '15.0']);
        expect(window.performance.measure).toHaveBeenCalledWith('pingMark-remote-1_pongMark-remote-1', 'pingMark-remote-1', 'pongMark-remote-1');
        expect(getEntriesSpy).toHaveBeenCalledTimes(2);
        expect(clearMarksSpy).toHaveBeenCalledWith('pingMark-remote-1');
        expect(clearMarksSpy).toHaveBeenCalledWith('pongMark-remote-1');
        expect(clearMeasuresSpy).toHaveBeenCalledWith('pingMark-remote-1_pongMark-remote-1');
        player.clear();
    });

    test('should throw on unknown player message', () => {
        // Given
        const { player } = createPlayer();
        const unknownMessage = { type: 'unknown', origin: MessageOriginType.PLAYER, payload: '' };

        // When
        const call = (): void => TestHelper.cast<{ onPlayerMessage(message: unknown): void }>(player).onPlayerMessage(unknownMessage);

        // Then
        expect(call).toThrow('Unhandled switch case');
        player.clear();
    });

    test('should emit the received network messages', () => {
        // Given
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { player, webrtcMock } = createPlayer();
        const messages: ReceivedMessage[] = [];
        player.message$.subscribe((message: ReceivedMessage) => messages.push(message));

        // When
        webrtcMock.data.next({ payload: 'invalid' });
        webrtcMock.data.next(blockChainMessage);

        // Then
        expect(warnSpy).toHaveBeenCalledWith('Invalid message from remote', { payload: 'invalid' });
        expect(messages).toEqual([{ ...blockChainMessage, from: 'remote' }]);
        player.clear();
    });

    test('clear should stop the player', () => {
        // Given
        const { player, webrtcMock } = createPlayer();
        const completeSpy = vi.fn();
        player.message$.subscribe({ complete: completeSpy });
        player.disconnected$.subscribe({ complete: completeSpy });

        // When
        player.clear();
        vi.advanceTimersByTime(5000);

        // Then
        expect(webrtcMock.close).toHaveBeenCalledTimes(1);
        expect(webrtcMock.sendMessage).not.toHaveBeenCalled();
        expect(webrtcMock.states.observed).toEqual(false);
        expect(completeSpy).toHaveBeenCalledTimes(2);
    });
});
