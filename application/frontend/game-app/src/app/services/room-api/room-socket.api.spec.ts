import { TestBed } from '@angular/core/testing';
import { RoomSocketApi, WEB_SOCKET_SERVER } from './room-socket.api';
import { RoomApiRequestTypeEnum, RoomSocketApiNotificationEnum, RoomSocketApiNotifications } from '@protocol/socket-packet-payload.type';
import { WebSocketMock } from '@testing/web-socket.mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

interface SentPacket {
    message: string;
    data: { id: number; type: string; data: unknown };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
}

describe('RoomSocketApi', () => {
    let api: RoomSocketApi;

    async function sendRequest<T>(request: () => Promise<T>): Promise<{ response: Promise<T>; socket: WebSocketMock; id: number }> {
        const response: Promise<T> = request();
        const socket: WebSocketMock = WebSocketMock.last();
        socket.open();
        await flush();
        const packet = socket.sentPackets().at(-1) as SentPacket;
        return { response, socket, id: packet.data.id };
    }

    beforeEach(() => {
        WebSocketMock.instances = [];
        vi.stubGlobal('WebSocket', WebSocketMock);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        TestBed.configureTestingModule({
            providers: [{ provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }],
        });
        api = TestBed.inject(RoomSocketApi);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('send should resolve with the response of the request', async () => {
        // Given
        const { response, socket, id } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.JOIN, { roomName: 'room', playerName: 'peer' }));

        // When
        socket.receive({ notAPacket: true });
        socket.receive({ id: id + 1, type: 'joiningRoom', data: { playerName: 'other' } });
        socket.receive({ id, type: 'joiningRoom', data: { playerName: 'host' } });

        // Then
        await expect(response).resolves.toEqual({ playerName: 'host' });
        expect(socket.sentPackets()[0]).toEqual({ message: 'sendmessage', data: { id, type: 'join', data: { roomName: 'room', playerName: 'peer' } } });
        expect(console.error).toHaveBeenCalledWith('Received payload is not a packet', { notAPacket: true });
    });

    test('send should reject on error response', async () => {
        // Given
        const { response, socket, id } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.CREATE, { roomName: 'room', maxPlayer: 2, playerName: 'host' }));

        // When
        socket.receive({ id, type: 'error', data: { message: 'Room already exists' } });

        // Then
        await expect(response).rejects.toThrow('Room already exists');
    });

    test('send should reject on unexpected response type', async () => {
        // Given
        const { response, socket, id } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName: 'room' }));

        // When
        socket.receive({ id, type: 'added', data: { playerName: 'host' } });

        // Then
        await expect(response).rejects.toThrow('Unexpected response type');
    });

    test('send should reject after the request timeout', async () => {
        // Given
        vi.useFakeTimers();
        const { response } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.FULL, { to: 'peer', roomName: 'room' }));
        const rejection = expect(response).rejects.toThrow('The request has timeout');

        // When
        vi.advanceTimersByTime(5000);

        // Then
        await rejection;
    });

    test('notification$ should only emit the notifications', async () => {
        // Given
        const notifications: RoomSocketApiNotifications[] = [];
        api.notification$.subscribe((notification: RoomSocketApiNotifications) => notifications.push(notification));
        const { response, socket, id } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'peer' }));

        // When
        socket.receive({ id: -1, type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'peer' } });
        socket.receive({ id, type: 'added', data: { playerName: 'peer' } });

        // Then
        await expect(response).resolves.toEqual({ playerName: 'peer' });
        expect(notifications).toEqual([{ id: -1, type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'peer' } }]);
    });

    test('notification$ should drop the remote signals a peer could not register', async () => {
        // Given
        const notifications: RoomSocketApiNotifications[] = [];
        api.notification$.subscribe((notification: RoomSocketApiNotifications) => notifications.push(notification));
        const { socket } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'peer' }));
        const validSignal = { sdp: { type: 'offer', sdp: 'sdp' }, ice: [{ candidate: 'c1', sdpMid: '0' }] };
        const invalidSignal = { sdp: { type: 'offer', sdp: 'sdp' }, ice: [{ candidate: 'c1' }] };

        // When
        socket.receive({ id: -1, type: RoomSocketApiNotificationEnum.REMOTE_SIGNAL, data: { from: 'peer', signal: invalidSignal } });
        socket.receive({ id: -1, type: RoomSocketApiNotificationEnum.REMOTE_SIGNAL, data: { from: 'peer', signal: validSignal } });

        // Then
        expect(notifications).toEqual([{ id: -1, type: RoomSocketApiNotificationEnum.REMOTE_SIGNAL, data: { from: 'peer', signal: validSignal } }]);
        expect(console.error).toHaveBeenCalledWith('Received an invalid notification', expect.objectContaining({ data: { from: 'peer', signal: invalidSignal } }));
    });

    test('close should stop the pending requests and close the socket', async () => {
        // Given
        const { response, socket, id } = await sendRequest(() => api.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'peer' }));
        let settled: boolean = false;
        response.finally(() => settled = true).catch(() => undefined);

        // When
        api.close();
        socket.receive({ id, type: 'removed', data: { playerName: 'peer' } });
        await flush();

        // Then
        expect(settled).toEqual(false);
        expect(socket.close).toHaveBeenCalledTimes(1);
    });
});
