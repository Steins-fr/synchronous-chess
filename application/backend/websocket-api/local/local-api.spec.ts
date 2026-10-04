import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { request as httpRequest, IncomingMessage } from 'node:http';
import { connect as netConnect, Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { handler as onConnect } from '../lambdas/onconnect/app';
import { LocalApi, startLocalApi } from './local-api';

// Spied, the original handler kept: its tests refuse or slow down the connections
vi.mock('../lambdas/onconnect/app', async (importOriginal: () => Promise<typeof import('../lambdas/onconnect/app')>) => {
    const original = await importOriginal();
    return { handler: vi.fn(original.handler) };
});

const HANDSHAKE: string = [
    'GET / HTTP/1.1',
    'Host: 127.0.0.1',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
].join('\r\n');

interface Closing {
    code: number;
    afterMs: number;
}

interface PostResponse {
    status: number | undefined;
    errorType: string | string[] | undefined;
}

function open(api: LocalApi): Promise<WebSocket> {
    return new Promise((resolve: (socket: WebSocket) => void, reject: (error: Error) => void) => {
        const socket = new WebSocket(api.endpoint);
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function nextMessage(socket: WebSocket): Promise<string> {
    return new Promise((resolve: (message: string) => void) => socket.once('message', (data: Buffer) => resolve(data.toString('utf8'))));
}

function closing(socket: WebSocket): Promise<Closing> {
    const start = Date.now();
    return new Promise((resolve: (closing: Closing) => void) => socket.once('close', (code: number) => resolve({ code, afterMs: Date.now() - start })));
}

function request(socket: WebSocket, type: string, data: object): void {
    socket.send(JSON.stringify({ message: 'sendmessage', data: { id: 1, type, data } }));
}

/** Sends a request, then reads the next message: its response */
async function reply(socket: WebSocket, type: string, data: object): Promise<{ type: string; data: Record<string, unknown> }> {
    const response = nextMessage(socket);
    request(socket, type, data);
    return JSON.parse(await response) as { type: string; data: Record<string, unknown> };
}

/** The connection id API Gateway gives in its answer to a message matching no route */
async function connectionIdOf(socket: WebSocket): Promise<string> {
    const answer = nextMessage(socket);
    socket.send('{}');
    return (JSON.parse(await answer) as { connectionId: string }).connectionId;
}

/** Sends the raw request of a handshake, then the client leaves after a while if told */
function rawHandshake(api: LocalApi, handshake: string, leave?: (client: Socket) => void): Promise<string> {
    return new Promise((resolve: (response: string) => void) => {
        let response = '';
        const client = netConnect(api.port, '127.0.0.1', () => {
            client.write(handshake);
            if (leave) {
                setTimeout(() => leave(client), 50);
            }
        });
        client.on('data', (chunk: Buffer) => response += chunk.toString('utf8'));
        client.on('error', () => undefined);
        client.on('close', () => resolve(response));
    });
}

function post(api: LocalApi, options: { method?: string; path?: string; headers?: Record<string, string>; body?: string }): Promise<PostResponse> {
    return new Promise((resolve: (response: PostResponse) => void, reject: (error: Error) => void) => {
        const outgoing = httpRequest({
            host: '127.0.0.1',
            port: api.port,
            method: options.method ?? 'POST',
            path: options.path ?? '/@connections/unknown',
            headers: { authorization: 'AWS4-HMAC-SHA256 Credential=local', ...options.headers },
        }, (response: IncomingMessage) => {
            response.resume();
            resolve({ status: response.statusCode, errorType: response.headers['x-amzn-errortype'] });
        });
        outgoing.on('error', reject);
        outgoing.end(options.body);
    });
}

function managementApi(api: LocalApi): ApiGatewayManagementApiClient {
    return new ApiGatewayManagementApiClient({
        endpoint: `http://127.0.0.1:${api.port}`,
        region: 'eu-west-3',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
}

/** The connections a route ran for, read from the log of the lambdas (with the closings of the previous test) */
function routeRuns(routeKey: string): string[] {
    return vi.mocked(console.log).mock.calls
        .map(([line]: unknown[]) => String(line))
        .filter((line: string) => line.startsWith(`${routeKey} `))
        .map((line: string) => line.split(' ')[1].replace(':', ''));
}

describe('local websocket API', () => {
    let api: LocalApi;
    const sockets: WebSocket[] = [];

    async function connected(): Promise<WebSocket> {
        const socket = await open(api);
        sockets.push(socket);
        return socket;
    }

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(onConnect).mockClear();
        api = await startLocalApi({ port: 0 });
    });

    afterEach(async () => {
        sockets.splice(0).forEach((socket: WebSocket) => socket.terminate());
        await api.close();
    });

    describe('websocket routes', () => {
        test('should answer a request through the lambdas and DynamoDB, and notify the other connections', async () => {
            // Given
            const host = await connected();
            const guest = await connected();
            const created = nextMessage(host);
            request(host, 'create', { roomName: 'flow', maxPlayer: 2, playerName: 'alice', token: 'alice-token' });
            expect(JSON.parse(await created)).toMatchObject({ type: 'created' });

            // When
            const joinRequest = nextMessage(host);
            const joining = nextMessage(guest);
            request(guest, 'join', { roomName: 'flow', playerName: 'bob', token: 'bob-token' });

            // Then
            expect(JSON.parse(await joinRequest)).toEqual({ type: 'joinRequest', data: { playerName: 'bob' } });
            expect(JSON.parse(await joining)).toMatchObject({ type: 'joiningRoom', data: { playerName: 'alice' } });
        });

        test('should answer Forbidden to a message matching no route', async () => {
            // Given
            const socket = await connected();
            const answer = nextMessage(socket);

            // When
            socket.send('not JSON');

            // Then
            expect(JSON.parse(await answer)).toMatchObject({ message: 'Forbidden', connectionId: expect.any(String) });
        });

        test('should answer nothing to a ping', async () => {
            // Given
            const socket = await connected();
            const answer = nextMessage(socket);

            // When
            socket.send(JSON.stringify({ message: 'ping' }));
            socket.send('{}');

            // Then: the first answer is the one to the second message
            expect(JSON.parse(await answer)).toMatchObject({ message: 'Forbidden' });
        });

        test('should close a connection sending a message larger than a frame, and keep serving the others', async () => {
            // Given
            const socket = await connected();
            const closed = closing(socket);

            // When
            socket.send('a'.repeat(33 * 1024));

            // Then
            expect((await closed).code).toEqual(1009);
            expect(await connectionIdOf(await connected())).toEqual(expect.any(String));
        });

        test('should run $disconnect when a connection closes', async () => {
            // Given
            const socket = await connected();
            const connectionId = await connectionIdOf(socket);

            // When
            socket.close();

            // Then
            await vi.waitFor(() => expect(routeRuns('$disconnect')).toContain(connectionId));
        });
    });

    // Through DynamoDB (dynalite), which evaluates the conditions of the writes. Its tables outlive the APIs of the
    // tests: each test has its own room
    describe('host reconnection', () => {
        async function hostedRoom(roomName: string): Promise<{ host: WebSocket; token: string }> {
            const host = await connected();
            const token = `${ roomName }-token`;
            expect(await reply(host, 'create', { roomName, maxPlayer: 2, playerName: 'alice', token })).toMatchObject({ type: 'created' });
            return { host, token };
        }

        async function disconnect(socket: WebSocket): Promise<void> {
            const connectionId = await connectionIdOf(socket);
            socket.close();
            await vi.waitFor(() => expect(routeRuns('$disconnect')).toContain(connectionId));
        }

        test('should move a room to a new connection of its host, before the former one closes', async () => {
            // Given
            const { host, token } = await hostedRoom('moved');
            const newHost = await connected();

            // When
            const reconnected = await reply(newHost, 'reconnect', { roomName: 'moved', playerName: 'alice', token });
            await disconnect(host);

            // Then
            expect(reconnected).toMatchObject({ type: 'reconnected', data: { roomName: 'moved' } });
            const joinRequest = nextMessage(newHost);
            expect(await reply(await connected(), 'join', { roomName: 'moved', playerName: 'bob', token: 'bob-token' })).toMatchObject({ type: 'joiningRoom' });
            expect(JSON.parse(await joinRequest)).toEqual({ type: 'joinRequest', data: { playerName: 'bob' } });
        });

        test('should keep the room of a disconnected host until it reconnects', async () => {
            // Given
            const { host, token } = await hostedRoom('waiting');
            await disconnect(host);
            const guest = await connected();
            expect(await reply(guest, 'join', { roomName: 'waiting', playerName: 'bob', token: 'bob-token' })).toMatchObject({ type: 'error', data: { message: 'Host disconnected' } });

            // When
            const reconnected = await reply(await connected(), 'reconnect', { roomName: 'waiting', playerName: 'alice', token });

            // Then
            expect(reconnected).toMatchObject({ type: 'reconnected' });
            expect(await reply(guest, 'join', { roomName: 'waiting', playerName: 'bob', token: 'bob-token' })).toMatchObject({ type: 'joiningRoom' });
        });

        test('should not move a room for another token', async () => {
            // Given
            await hostedRoom('kept');

            // When
            const refused = await reply(await connected(), 'reconnect', { roomName: 'kept', playerName: 'alice', token: 'other-token' });

            // Then
            expect(refused).toMatchObject({ type: 'error', data: { message: 'You are not the host of the room' } });
        });

        test('should keep the name of a room waiting for its host', async () => {
            // Given
            const { host, token } = await hostedRoom('taken');
            await disconnect(host);

            // When
            const created = await reply(await connected(), 'create', { roomName: 'taken', maxPlayer: 2, playerName: 'bob', token: 'bob-token' });

            // Then
            expect(created).toMatchObject({ type: 'error', data: { message: 'Room already exists' } });
            expect(await reply(await connected(), 'reconnect', { roomName: 'taken', playerName: 'alice', token })).toMatchObject({ type: 'reconnected' });
        });
    });

    describe('handshake', () => {
        test('should refuse an invalid handshake without running $connect', async () => {
            // When
            const response = await rawHandshake(api, HANDSHAKE.replace('Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n', ''));

            // Then
            expect(response).toMatch(/^HTTP\/1\.1 400 /);
            expect(onConnect).not.toHaveBeenCalled();
        });

        test('should refuse a connection with the status code of $connect, without $disconnect', async () => {
            // Given
            vi.mocked(onConnect).mockResolvedValueOnce({ statusCode: 401, body: 'Refused' });

            // When
            const response = await rawHandshake(api, HANDSHAKE);

            // Then
            expect(response).toMatch(/^HTTP\/1\.1 401 Unauthorized\r\n/);
            expect(response).toContain('Connection: close');
            expect(routeRuns('$connect')).toHaveLength(1);
            expect(routeRuns('$disconnect')).not.toContain(routeRuns('$connect')[0]);
        });

        test.each([
            ['resets the connection', (client: Socket): void => void client.resetAndDestroy()],
            ['closes the connection', (client: Socket): void => void client.end()],
        ])('should run $disconnect for a client that %s during $connect', async (_case: string, leave: (client: Socket) => void) => {
            // Given: a slow $connect
            vi.mocked(onConnect).mockImplementationOnce(() => new Promise((resolve: (response: { statusCode: number; body: string }) => void) => {
                setTimeout(() => resolve({ statusCode: 200, body: 'Connected' }), 200);
            }));

            // When
            await rawHandshake(api, HANDSHAKE, leave);

            // Then
            await vi.waitFor(() => {
                expect(routeRuns('$connect')).toHaveLength(1);
                expect(routeRuns('$disconnect')).toContain(routeRuns('$connect')[0]);
            });
        });
    });

    describe('PostToConnection', () => {
        test('should post to a connection', async () => {
            // Given
            const socket = await connected();
            const connectionId = await connectionIdOf(socket);
            const received = nextMessage(socket);

            // When
            await managementApi(api).send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: 'hello' }));

            // Then
            expect(await received).toEqual('hello');
        });

        test.each([
            ['a GET', { method: 'GET' }, 404, undefined],
            ['another path', { path: '/connections/unknown' }, 404, undefined],
            ['an unsigned request', { headers: { authorization: '' } }, 403, 'ForbiddenException'],
            ['a request to another host (DNS rebinding)', { headers: { host: 'attacker.test:3001' } }, 403, 'ForbiddenException'],
            ['a malformed connection id', { path: '/@connections/%E0%A4%A' }, 400, 'BadRequestException'],
            ['an unknown connection', {}, 410, 'GoneException'],
            ['a message larger than 128 KB', { body: 'a'.repeat(129 * 1024) }, 413, 'PayloadTooLargeException'],
        ])('should refuse %s', async (_case: string, options: object, status: number, errorType: string | undefined) => {
            expect(await post(api, options)).toEqual({ status, errorType });
        });

        test('should give the SDK its exceptions', async () => {
            await expect(managementApi(api).send(new PostToConnectionCommand({ ConnectionId: 'unknown', Data: 'hello' })))
                .rejects.toMatchObject({ name: 'GoneException' });
        });
    });

    describe('timeouts', () => {
        beforeEach(async () => {
            await api.close();
            api = await startLocalApi({ port: 0, idleTimeoutMs: 200, maxConnectionMs: 600 });
        });

        test('should close an idle connection', async () => {
            // Given
            const closed = closing(await connected());

            // When / Then
            expect(await closed).toEqual({ code: 1001, afterMs: expect.any(Number) });
        });

        test('should keep open a connection receiving messages, until its maximum duration', async () => {
            // Given
            const socket = await connected();
            const closed = closing(socket);
            const connectionId = await connectionIdOf(socket);

            // When: only the server talks
            const posting = setInterval(() => {
                managementApi(api).send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: 'ping' })).catch(() => undefined);
            }, 50);
            const { code, afterMs } = await closed;
            clearInterval(posting);

            // Then
            expect(code).toEqual(1001);
            expect(afterMs).toBeGreaterThanOrEqual(500);
        });

        test('should keep open a connection sending messages, until its maximum duration', async () => {
            // Given
            const socket = await connected();
            const closed = closing(socket);

            // When: only the client talks
            const sending = setInterval(() => socket.send('{}'), 50);
            const { code, afterMs } = await closed;
            clearInterval(sending);

            // Then
            expect(code).toEqual(1001);
            expect(afterMs).toBeGreaterThanOrEqual(500);
        });
    });
});
