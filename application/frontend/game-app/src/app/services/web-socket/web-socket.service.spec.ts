import { SocketState, WebSocketService } from './web-socket.service';
import { WebSocketMock } from '@testing/web-socket.mock';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

function stateOf(service: WebSocketService): BehaviorSubject<SocketState> {
    return (service as unknown as { _state: BehaviorSubject<SocketState> })._state;
}

describe('WebSocketService', () => {
    beforeEach(() => {
        WebSocketMock.reset();
        vi.stubGlobal('WebSocket', WebSocketMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('send should fail without server url', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('');

        // When / Then
        await expect(service.send('message', 1)).rejects.toThrow(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP);
    });

    test('send should open the connection then send the packet', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');

        // When
        const sending: Promise<{ value: number }> = service.send('message', { value: 1 });
        const socket: WebSocketMock = WebSocketMock.last();
        socket.open();

        // Then
        expect(await sending).toEqual({ value: 1 });
        expect(socket.url).toEqual('ws://server');
        expect(socket.sentPackets()).toEqual([{ message: 'message', data: { value: 1 } }]);
    });

    test('send should reuse the pending or open connection', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');

        // When
        const first: Promise<number> = service.send('message', 1);
        const second: Promise<number> = service.send('message', 2);
        WebSocketMock.last().open();
        await Promise.all([first, second]);
        await service.send('message', 3);

        // Then
        expect(WebSocketMock.instances).toHaveLength(1);
        expect(WebSocketMock.last().send).toHaveBeenCalledTimes(3);
    });

    test('send should fail if the connection is closed before being opened', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');

        // When
        const sending: Promise<number> = service.send('message', 1);
        WebSocketMock.last().closeFromServer();

        // Then
        await expect(sending).rejects.toThrow('Socket connection failed');
        expect(WebSocketMock.last().close).not.toHaveBeenCalled();
    });

    test('send should reconnect a closing connection', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        stateOf(service).next(SocketState.CLOSING);

        // When
        const sending: Promise<number> = service.send('message', 1);
        WebSocketMock.last().open();

        // Then
        expect(await sending).toEqual(1);
    });

    test('send should fail if the socket was closed during the connection', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        const connecting: Promise<number> = service.send('message', 1);
        service.close();

        // When
        const sending: Promise<number> = service.send('message', 2);

        // Then
        await expect(sending).rejects.toThrow('Socket connection failed');
        WebSocketMock.last().closeFromServer();
        await expect(connecting).rejects.toThrow('Socket connection failed');
    });

    test('send should fail if the socket was closed while open', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        const opening: Promise<number> = service.send('message', 1);
        WebSocketMock.last().open();
        await opening;
        service.close();

        // When / Then
        await expect(service.send('message', 2)).rejects.toThrow('Socket connection failed');
    });

    test('send should throw on unknown socket state', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        stateOf(service).next(99 as SocketState);

        // When / Then
        await expect(service.send('message', 1)).rejects.toThrow('Unhandled switch case: 99');
    });

    test('should emit the received messages', () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        const messages: string[] = [];
        service.message.subscribe((message: string) => messages.push(message));
        void service.send('message', 1);

        // When
        WebSocketMock.last().receive('hello');

        // Then
        expect(messages).toEqual(['"hello"']);
    });

    test('close should close an active socket only', async () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        service.close();
        const opening: Promise<number> = service.send('message', 1);
        const socket: WebSocketMock = WebSocketMock.last();
        socket.open();
        await opening;

        // When
        service.close();

        // Then
        expect(socket.close).toHaveBeenCalledTimes(1);
    });

    test('close should not close an already closed socket', () => {
        // Given
        const service: WebSocketService = new WebSocketService('ws://server');
        void service.send('message', 1);
        const socket: WebSocketMock = WebSocketMock.last();
        socket.readyState = WebSocketMock.CLOSED;

        // When
        service.close();

        // Then
        expect(socket.close).not.toHaveBeenCalled();
    });
});
