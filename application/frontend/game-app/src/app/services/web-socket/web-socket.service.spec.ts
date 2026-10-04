import { SocketState, WebSocketService } from './web-socket.service';
import { WebSocketMock } from '@testing/web-socket.mock';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

function stateOf(service: WebSocketService): BehaviorSubject<SocketState> {
    return (service as unknown as { _state: BehaviorSubject<SocketState> })._state;
}

describe('WebSocketService', () => {
    let service: WebSocketService;

    /** A service whose socket is open */
    async function openService(): Promise<WebSocketMock> {
        service = new WebSocketService('ws://server');
        const opening: Promise<number> = service.send('message', 1);
        const socket: WebSocketMock = WebSocketMock.last();
        socket.open();
        await opening;
        socket.send.mockClear();
        return socket;
    }

    beforeEach(() => {
        WebSocketMock.reset();
        vi.stubGlobal('WebSocket', WebSocketMock);
    });

    afterEach(() => {
        // Stops the pings of the open sockets
        service?.close();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    test('send should fail without server url', async () => {
        // Given
        service = new WebSocketService('');

        // When / Then
        await expect(service.send('message', 1)).rejects.toThrow(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP);
    });

    test('send should open the connection then send the packet', async () => {
        // Given
        service = new WebSocketService('ws://server');

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
        service = new WebSocketService('ws://server');

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
        service = new WebSocketService('ws://server');

        // When
        const sending: Promise<number> = service.send('message', 1);
        WebSocketMock.last().closeFromServer();

        // Then
        await expect(sending).rejects.toThrow('Socket connection failed');
        expect(WebSocketMock.last().close).not.toHaveBeenCalled();
    });

    test('send should reconnect a closing connection', async () => {
        // Given
        service = new WebSocketService('ws://server');
        stateOf(service).next(SocketState.CLOSING);

        // When
        const sending: Promise<number> = service.send('message', 1);
        WebSocketMock.last().open();

        // Then
        expect(await sending).toEqual(1);
    });

    test('send should fail if the socket was closed during the connection', async () => {
        // Given
        service = new WebSocketService('ws://server');
        const connecting: Promise<number> = service.send('message', 1);

        // When
        service.close();

        // Then
        await expect(connecting).rejects.toThrow('Socket connection failed');
        expect(WebSocketMock.last().close).toHaveBeenCalledTimes(1);
    });

    test('send should open a new socket once the socket was closed', async () => {
        // Given
        const socket: WebSocketMock = await openService();
        service.close();

        // When
        const sending: Promise<number> = service.send('message', 2);
        WebSocketMock.last().open();

        // Then
        expect(await sending).toEqual(2);
        expect(WebSocketMock.instances).toHaveLength(2);
        expect(socket.send).not.toHaveBeenCalled();
    });

    test('send should fail if the state is open without socket', async () => {
        // Given
        service = new WebSocketService('ws://server');
        stateOf(service).next(SocketState.OPEN);

        // When / Then
        await expect(service.send('message', 1)).rejects.toThrow('Socket connection failed');
    });

    test('send should throw on unknown socket state', async () => {
        // Given
        service = new WebSocketService('ws://server');
        stateOf(service).next(99 as SocketState);

        // When / Then
        await expect(service.send('message', 1)).rejects.toThrow('Unhandled switch case: 99');
    });

    test('should emit the received messages', () => {
        // Given
        service = new WebSocketService('ws://server');
        const messages: string[] = [];
        service.message.subscribe((message: string) => messages.push(message));
        service.send('message', 1).catch(() => undefined);

        // When
        WebSocketMock.last().receive('hello');

        // Then
        expect(messages).toEqual(['"hello"']);
    });

    test('close should close an active socket only', async () => {
        // Given
        service = new WebSocketService('ws://server');
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

    test('should not ping a socket not kept alive', async () => {
        // Given
        vi.useFakeTimers();
        const socket: WebSocketMock = await openService();

        // When
        vi.advanceTimersByTime(5 * 60_000);

        // Then
        expect(socket.send).not.toHaveBeenCalled();
    });

    test('should ping an open socket kept alive every 5 minutes, until it closes', async () => {
        // Given
        vi.useFakeTimers();
        const socket: WebSocketMock = await openService();

        // When
        service.keepAlive();
        service.keepAlive();
        vi.advanceTimersByTime(5 * 60_000);
        socket.closeFromServer();
        vi.advanceTimersByTime(5 * 60_000);

        // Then
        expect(socket.sentPackets()).toEqual([{ message: 'ping' }]);
    });

    test('should ping a socket opened once kept alive', async () => {
        // Given
        vi.useFakeTimers();
        service = new WebSocketService('ws://server');
        service.keepAlive();

        // When
        const opening: Promise<number> = service.send('message', 1);
        WebSocketMock.last().open();
        await opening;
        vi.advanceTimersByTime(5 * 60_000);

        // Then
        expect(WebSocketMock.last().sentPackets()).toEqual([{ message: 'message', data: 1 }, { message: 'ping' }]);
    });

    test('should keep the sockets alive after one failed to open', async () => {
        // Given
        vi.useFakeTimers();
        service = new WebSocketService('ws://server');
        service.keepAlive();
        const failing: Promise<number> = service.send('message', 1);
        WebSocketMock.last().closeFromServer();
        await expect(failing).rejects.toThrow('Socket connection failed');

        // When
        const opening: Promise<number> = service.send('message', 2);
        WebSocketMock.last().open();
        await opening;
        vi.advanceTimersByTime(5 * 60_000);

        // Then
        expect(WebSocketMock.last().sentPackets()).toEqual([{ message: 'message', data: 2 }, { message: 'ping' }]);
    });

    test('should stop pinging a socket closed by the service, and not ping the next one', async () => {
        // Given
        vi.useFakeTimers();
        const socket: WebSocketMock = await openService();
        service.keepAlive();

        // When
        service.close();
        const opening: Promise<number> = service.send('message', 2);
        const next: WebSocketMock = WebSocketMock.last();
        next.open();
        await opening;
        vi.advanceTimersByTime(5 * 60_000);

        // Then
        expect(socket.send).not.toHaveBeenCalled();
        expect(next.sentPackets()).toEqual([{ message: 'message', data: 2 }]);
    });

    test('openedAt should be when the current socket opened', async () => {
        // Given
        vi.useFakeTimers({ now: 1000 });
        service = new WebSocketService('ws://server');
        const before: number | undefined = service.openedAt;
        const opening: Promise<number> = service.send('message', 1);
        vi.advanceTimersByTime(500);

        // When
        WebSocketMock.last().open();
        await opening;

        // Then
        expect(before).toBeUndefined();
        expect(service.openedAt).toEqual(1500);
        WebSocketMock.last().closeFromServer();
        expect(service.openedAt).toBeUndefined();
    });

    test('openedAt should be undefined once the service closed its socket', async () => {
        // Given
        await openService();

        // When
        service.close();

        // Then
        expect(service.openedAt).toBeUndefined();
    });

    test('closed$ should emit when the server closes the open socket', async () => {
        // Given
        const socket: WebSocketMock = await openService();
        const closed = vi.fn();
        service.closed$.subscribe(closed);

        // When
        socket.closeFromServer();

        // Then
        expect(closed).toHaveBeenCalledTimes(1);
    });

    test('closed$ should not emit for a socket closed before being opened, or by the service', async () => {
        // Given
        service = new WebSocketService('ws://server');
        const closed = vi.fn();
        service.closed$.subscribe(closed);
        const sending: Promise<number> = service.send('message', 1);
        WebSocketMock.last().closeFromServer();
        await expect(sending).rejects.toThrow('Socket connection failed');
        const socket: WebSocketMock = await openService();
        service.closed$.subscribe(closed);

        // When
        service.close();
        socket.closeFromServer();

        // Then
        expect(closed).not.toHaveBeenCalled();
    });

    describe('replace', () => {
        test('should hand a new socket over, then close the former one', async () => {
            // Given
            const former: WebSocketMock = await openService();
            const messages: string[] = [];
            service.message.subscribe((message: string) => messages.push(message));

            // When
            const replacing: Promise<void> = service.replace(async (send) => {
                send('message', 'handover');
                former.receive('during the handover');
            });
            const next: WebSocketMock = WebSocketMock.last();
            next.open();
            await replacing;
            await service.send('message', 'after');

            // Then
            expect(next.sentPackets()).toEqual([{ message: 'message', data: 'handover' }, { message: 'message', data: 'after' }]);
            expect(former.close).toHaveBeenCalledTimes(1);
            expect(former.send).not.toHaveBeenCalled();
            expect(messages).toEqual(['"during the handover"']);
        });

        test('should hold the sends during the handover, then send them through the new socket', async () => {
            // Given
            const former: WebSocketMock = await openService();
            let sending: Promise<string> | undefined;

            // When
            const replacing: Promise<void> = service.replace(async (send) => {
                sending = service.send('message', 'during');
                send('message', 'handover');
            });
            const next: WebSocketMock = WebSocketMock.last();
            next.open();
            await replacing;
            await sending;

            // Then
            expect(former.send).not.toHaveBeenCalled();
            expect(next.sentPackets()).toEqual([{ message: 'message', data: 'handover' }, { message: 'message', data: 'during' }]);
        });

        test('should hold the sends until the last replacement ends', async () => {
            // Given: two replacements at a time, the first one ending first
            await openService();
            let finishSecond: () => void = () => undefined;
            const first: Promise<void> = service.replace(() => Promise.resolve());
            WebSocketMock.last().open();
            const second: Promise<void> = service.replace(() => new Promise<void>((resolve) => finishSecond = resolve));
            const last: WebSocketMock = WebSocketMock.last();
            last.open();
            await first;

            // When
            const sending: Promise<string> = service.send('message', 'held');
            await Promise.resolve();
            const sentBeforeTheEnd: number = last.send.mock.calls.length;
            finishSecond();
            await second;
            await sending;

            // Then
            expect(sentBeforeTheEnd).toEqual(0);
            expect(last.sentPackets()).toEqual([{ message: 'message', data: 'held' }]);
        });

        test('should send the held messages through the former socket when the handover fails', async () => {
            // Given
            const former: WebSocketMock = await openService();
            let sending: Promise<string> | undefined;

            // When
            const replacing: Promise<void> = service.replace(async () => {
                sending = service.send('message', 'during');
                throw new Error('Refused');
            });
            WebSocketMock.last().open();
            await expect(replacing).rejects.toThrow('Refused');
            await sending;

            // Then
            expect(former.sentPackets()).toEqual([{ message: 'message', data: 'during' }]);
        });

        test('should abandon the replacement when the service closes before the new socket opened', async () => {
            // Given
            await openService();
            const handover = vi.fn();
            const replacing: Promise<void> = service.replace(handover);
            const next: WebSocketMock = WebSocketMock.last();

            // When
            service.close();
            next.open();

            // Then
            await expect(replacing).rejects.toThrow('Socket closed during its replacement');
            expect(handover).not.toHaveBeenCalled();
            expect(next.close).toHaveBeenCalledTimes(1);
        });

        test('should abandon the replacement when the service closes during the handover', async () => {
            // Given
            await openService();

            // When: the host leaves its room while the API moves it
            const replacing: Promise<void> = service.replace(async () => service.close());
            const next: WebSocketMock = WebSocketMock.last();
            next.open();

            // Then: the new socket closes, the API lets the room wait for its host
            await expect(replacing).rejects.toThrow('Socket closed during its replacement');
            expect(next.close).toHaveBeenCalledTimes(1);
            expect(service.openedAt).toBeUndefined();
        });

        test('should replace a closed socket, and give it to the sends waiting for a socket', async () => {
            // Given: the socket closed, a send opening another one
            const former: WebSocketMock = await openService();
            former.closeFromServer();
            const sending: Promise<number> = service.send('message', 2);
            const reopened: WebSocketMock = WebSocketMock.last();

            // When
            const replacing: Promise<void> = service.replace(() => Promise.resolve());
            const next: WebSocketMock = WebSocketMock.last();
            next.open();
            await replacing;

            // Then
            expect(await sending).toEqual(2);
            expect(next.sentPackets()).toEqual([{ message: 'message', data: 2 }]);
            expect(reopened.close).toHaveBeenCalledTimes(1);
            expect(former.close).not.toHaveBeenCalled();
        });

        test('should replace the socket of a service never opened', async () => {
            // Given
            service = new WebSocketService('ws://server');
            const closed = vi.fn();
            service.closed$.subscribe(closed);

            // When
            const replacing: Promise<void> = service.replace(() => Promise.resolve());
            const next: WebSocketMock = WebSocketMock.last();
            next.open();
            await replacing;
            next.closeFromServer();

            // Then: the new socket is the current one
            expect(closed).toHaveBeenCalledTimes(1);
        });

        test('should ping the new socket instead of the former one', async () => {
            // Given
            vi.useFakeTimers();
            const former: WebSocketMock = await openService();
            service.keepAlive();
            const replacing: Promise<void> = service.replace(() => Promise.resolve());
            const next: WebSocketMock = WebSocketMock.last();
            next.open();
            await replacing;

            // When
            vi.advanceTimersByTime(5 * 60_000);

            // Then
            expect(next.sentPackets()).toEqual([{ message: 'ping' }]);
            expect(former.send).not.toHaveBeenCalled();
        });

        test('should fail when the new socket does not open', async () => {
            // Given
            const former: WebSocketMock = await openService();
            const handover = vi.fn();

            // When
            const replacing: Promise<void> = service.replace(handover);
            WebSocketMock.last().closeFromServer();

            // Then
            await expect(replacing).rejects.toThrow('Socket connection failed');
            expect(handover).not.toHaveBeenCalled();
            expect(former.close).not.toHaveBeenCalled();
        });

        test('should close the new socket when the handover fails, and keep the former one', async () => {
            // Given
            const former: WebSocketMock = await openService();

            // When
            const replacing: Promise<void> = service.replace(() => Promise.reject(new Error('Refused')));
            const next: WebSocketMock = WebSocketMock.last();
            next.open();

            // Then
            await expect(replacing).rejects.toThrow('Refused');
            expect(next.close).toHaveBeenCalledTimes(1);
            expect(former.close).not.toHaveBeenCalled();
            await service.send('message', 'after');
            expect(former.sentPackets()).toEqual([{ message: 'message', data: 'after' }]);
        });

        test('should fail when the new socket closes during the handover', async () => {
            // Given
            const former: WebSocketMock = await openService();

            // When: the new socket is the last one during the handover
            const replacing: Promise<void> = service.replace(async () => WebSocketMock.last().closeFromServer());
            const next: WebSocketMock = WebSocketMock.last();
            next.open();

            // Then
            await expect(replacing).rejects.toThrow('Socket connection failed');
            expect(next.close).not.toHaveBeenCalled();
            expect(former.close).not.toHaveBeenCalled();
        });

        test('should fail without server url', async () => {
            // Given
            service = new WebSocketService('');

            // When / Then
            await expect(service.replace(() => Promise.resolve())).rejects.toThrow(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP);
        });
    });

    test('close should not close an already closed socket', () => {
        // Given
        service = new WebSocketService('ws://server');
        service.send('message', 1).catch(() => undefined);
        const socket: WebSocketMock = WebSocketMock.last();
        socket.readyState = WebSocketMock.CLOSED;

        // When
        service.close();

        // Then
        expect(socket.close).not.toHaveBeenCalled();
    });
});
