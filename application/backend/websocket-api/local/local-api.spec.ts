import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { request as httpRequest, IncomingMessage } from 'node:http';
import { connect as netConnect, Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { handler as httpApi } from '../lambdas/httpapi/app';
import { handler as onConnect } from '../lambdas/onconnect/app';
import { LocalApi, startLocalApi } from './local-api';

// Spied, the original handler kept: its tests refuse or slow down the connections
vi.mock('../lambdas/onconnect/app', async (importOriginal: () => Promise<typeof import('../lambdas/onconnect/app')>) => {
    const original = await importOriginal();
    return { handler: vi.fn(original.handler) };
});

// Spied, the original handler kept: a test makes it fail
vi.mock('../lambdas/httpapi/app', async (importOriginal: () => Promise<typeof import('../lambdas/httpapi/app')>) => {
    const original = await importOriginal();
    return { handler: vi.fn(original.handler) };
});

// The game app served locally (environment.local.ts of the game app)
const APP_ORIGIN: string = 'http://localhost:4200';

// Of a page of the game app
const HANDSHAKE: string = [
    'GET / HTTP/1.1',
    'Host: 127.0.0.1',
    `Origin: ${ APP_ORIGIN }`,
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

interface HttpResponse {
    status: number | undefined;
    contentType: string | undefined;
    allowedOrigin: string | undefined;
    allowedMethods: string | undefined;
    /** Parsed, undefined without */
    body: unknown;
}

/** Opens a connection like a page of the game app: with its Origin */
function open(api: LocalApi): Promise<WebSocket> {
    return new Promise((resolve: (socket: WebSocket) => void, reject: (error: Error) => void) => {
        const socket = new WebSocket(api.endpoint, { origin: APP_ORIGIN });
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

/** Creates a room, then reads its id: its name and the tag the API drew */
async function createRoom(socket: WebSocket, data: object): Promise<string> {
    const created = await reply(socket, 'create', data);
    expect(created).toMatchObject({ type: 'created' });
    return created.data['roomName'] as string;
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

/** A request to the HTTP API, like a page of the game app sends it by default */
function sendHttp(api: LocalApi, method: string, path: string, headers: Record<string, string> = { Origin: APP_ORIGIN }): Promise<HttpResponse> {
    return new Promise((resolve: (response: HttpResponse) => void, reject: (error: Error) => void) => {
        const outgoing = httpRequest({ host: '127.0.0.1', port: api.port, method, path, headers }, (response: IncomingMessage) => {
            let body = '';
            response.on('data', (chunk: Buffer) => body += chunk.toString('utf8'));
            response.on('end', () => resolve({
                status: response.statusCode,
                contentType: response.headers['content-type'],
                allowedOrigin: response.headers['access-control-allow-origin'],
                allowedMethods: response.headers['access-control-allow-methods'],
                body: body === '' ? undefined : JSON.parse(body),
            }));
        });
        outgoing.on('error', reject);
        outgoing.end();
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

describe('local API', () => {
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
        // The origins server.ts gives, restored after each test (unstubEnvs)
        vi.stubEnv('ALLOWED_ORIGINS', `${ APP_ORIGIN },http://127.0.0.1:4200`);
        api = await startLocalApi({ port: 0 });
    });

    afterEach(async () => {
        sockets.splice(0).forEach((socket: WebSocket) => socket.terminate());
        await api.close();
    });

    describe('websocket routes', () => {
        test('should answer a request through the lambdas and the database, and notify the other connections', async () => {
            // Given
            const host = await connected();
            const guest = await connected();
            const roomName = await createRoom(host, { roomName: 'flow', maxPlayer: 2, game: 'chess', playerName: 'alice', token: 'alice-token', browserId: 'alice-browser' });

            // When
            const joinRequest = nextMessage(host);
            const joining = nextMessage(guest);
            request(guest, 'join', { roomName, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' });

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

        test('should run the lambda of a ping, which keeps the database awake, and answer nothing', async () => {
            // Given
            const socket = await connected();
            const connectionId = await connectionIdOf(socket);
            const answer = nextMessage(socket);

            // When
            socket.send(JSON.stringify({ message: 'ping' }));
            socket.send('{}');

            // Then: the first answer is the one to the second message
            expect(JSON.parse(await answer)).toMatchObject({ message: 'Forbidden' });
            await vi.waitFor(() => expect(routeRuns('ping')).toContain(connectionId));
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

    // Through the database (PGlite), which evaluates the conditions of the writes. Its tables outlive the APIs of the
    // tests: each test has its own room
    describe('host reconnection', () => {
        async function hostedRoom(name: string): Promise<{ host: WebSocket; token: string; roomName: string }> {
            const host = await connected();
            const token = `${ name }-token`;
            const roomName = await createRoom(host, { roomName: name, maxPlayer: 2, game: 'chess', playerName: 'alice', token, browserId: 'alice-browser' });
            return { host, token, roomName };
        }

        async function disconnect(socket: WebSocket): Promise<void> {
            const connectionId = await connectionIdOf(socket);
            socket.close();
            await vi.waitFor(() => expect(routeRuns('$disconnect')).toContain(connectionId));
        }

        test('should move a room to a new connection of its host, before the former one closes', async () => {
            // Given
            const { host, token, roomName } = await hostedRoom('moved');
            const newHost = await connected();

            // When
            const reconnected = await reply(newHost, 'reconnect', { roomName, playerName: 'alice', token });
            await disconnect(host);

            // Then
            expect(reconnected).toMatchObject({ type: 'reconnected', data: { roomName } });
            const joinRequest = nextMessage(newHost);
            expect(await reply(await connected(), 'join', { roomName, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' })).toMatchObject({ type: 'joiningRoom' });
            expect(JSON.parse(await joinRequest)).toEqual({ type: 'joinRequest', data: { playerName: 'bob' } });
        });

        test('should keep the room of a disconnected host until it reconnects', async () => {
            // Given
            const { host, token, roomName } = await hostedRoom('waiting');
            await disconnect(host);
            const guest = await connected();
            expect(await reply(guest, 'join', { roomName, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' })).toMatchObject({ type: 'error', data: { message: 'Host disconnected' } });

            // When
            const reconnected = await reply(await connected(), 'reconnect', { roomName, playerName: 'alice', token });

            // Then
            expect(reconnected).toMatchObject({ type: 'reconnected' });
            expect(await reply(guest, 'join', { roomName, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' })).toMatchObject({ type: 'joiningRoom' });
        });

        test('should not move a room for another token', async () => {
            // Given
            const { roomName } = await hostedRoom('kept');

            // When
            const refused = await reply(await connected(), 'reconnect', { roomName, playerName: 'alice', token: 'other-token' });

            // Then
            expect(refused).toMatchObject({ type: 'error', data: { message: 'You are not the host of the room' } });
        });

        test('should let a player of the room take it over once its host left, its new host', async () => {
            // Given: bob in the room
            const { host, roomName } = await hostedRoom('handed');
            const player = await connected();
            expect(await reply(player, 'join', { roomName, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' })).toMatchObject({ type: 'joiningRoom' });
            expect(await reply(host, 'playerAdd', { roomName, playerName: 'bob' })).toMatchObject({ type: 'added' });
            const newHost = await connected();
            const refused = await reply(newHost, 'reconnect', { roomName, playerName: 'bob', token: 'bob-token' });

            // When
            await disconnect(host);
            const reconnected = await reply(newHost, 'reconnect', { roomName, playerName: 'bob', token: 'bob-token' });

            // Then
            expect(refused).toMatchObject({ type: 'error', data: { message: 'Host connected' } });
            expect(reconnected).toMatchObject({ type: 'reconnected' });
            const joinRequest = nextMessage(newHost);
            expect(await reply(await connected(), 'join', { roomName, game: 'chess', playerName: 'carol', token: 'carol-token', browserId: 'carol-browser' }))
                .toMatchObject({ type: 'joiningRoom', data: { playerName: 'bob' } });
            expect(JSON.parse(await joinRequest)).toEqual({ type: 'joinRequest', data: { playerName: 'carol' } });
        });

        test('should let a player the host removed join its private room again without the password, by its token', async () => {
            // Given
            const host = await connected();
            const roomName = await createRoom(host, { roomName: 'left', maxPlayer: 2, game: 'chess', password: 'secret', playerName: 'alice', token: 'alice-token', browserId: 'alice-browser' });
            const bob = await connected();
            expect(await reply(bob, 'join', { roomName, game: 'chess', playerName: 'bob', password: 'secret', token: 'bob-token', browserId: 'bob-browser' }))
                .toMatchObject({ type: 'joiningRoom' });
            expect(await reply(host, 'playerAdd', { roomName, playerName: 'bob' })).toMatchObject({ type: 'added' });
            await disconnect(bob);

            // When
            const removed = await reply(host, 'playerRemove', { roomName, playerName: 'bob' });

            // Then: another page of the name needs the password
            expect(removed).toMatchObject({ type: 'removed' });
            expect(await reply(await connected(), 'join', { roomName, game: 'chess', playerName: 'bob', token: 'other-token', browserId: 'bob-browser' }))
                .toMatchObject({ type: 'error', data: { message: 'Wrong password' } });
            expect(await reply(await connected(), 'join', { roomName, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' }))
                .toMatchObject({ type: 'joiningRoom', data: { playerName: 'alice' } });
        });

        test('should create a room of a name taken under another tag, the room waiting for its host keeping its id', async () => {
            // Given
            const { host, token, roomName } = await hostedRoom('taken');
            await disconnect(host);

            // When
            const otherRoomName = await createRoom(await connected(), { roomName: 'taken', maxPlayer: 2, game: 'chess', playerName: 'bob', token: 'bob-token', browserId: 'bob-browser' });

            // Then
            expect(roomName).toMatch(/^taken#\d{6}$/);
            expect(otherRoomName).toMatch(/^taken#\d{6}$/);
            expect(otherRoomName).not.toEqual(roomName);
            expect(await reply(await connected(), 'reconnect', { roomName, playerName: 'alice', token })).toMatchObject({ type: 'reconnected' });
        });
    });

    describe('open rooms', () => {
        // The game of no other test: the database keeps the rooms of the previous tests
        test('should list over HTTP the most recent rooms of a game through its index, searched, and let a player join a private one with its password', async () => {
            // Given
            const host = await connected();
            const listed = await createRoom(host, { roomName: 'chat-listed', maxPlayer: 6, game: 'chat', password: 'secret', playerName: 'alice', token: 'alice-token', browserId: 'alice-browser' });
            const waiting = await connected();
            const waitingRoom = await createRoom(waiting, { roomName: 'chat-waiting', maxPlayer: 6, game: 'chat', playerName: 'carol', token: 'carol-token', browserId: 'carol-browser' });
            const waitingId = await connectionIdOf(waiting);
            waiting.close();
            await vi.waitFor(() => expect(routeRuns('$disconnect')).toContain(waitingId));

            // When
            const rooms = await sendHttp(api, 'GET', '/rooms?game=chat');
            const searched = await sendHttp(api, 'GET', '/rooms?game=chat&search=Chat-L');
            const searchedById = await sendHttp(api, 'GET', `/rooms?game=chat&search=${ encodeURIComponent(listed) }`);

            // Then
            expect(rooms).toEqual({
                status: 200,
                contentType: 'application/json',
                allowedOrigin: APP_ORIGIN,
                allowedMethods: undefined,
                body: {
                    rooms: [
                        { roomName: waitingRoom, hostPlayer: 'carol', playerCount: 1, maxPlayer: 6, isPrivate: false, hostConnected: false },
                        { roomName: listed, playerCount: 1, maxPlayer: 6, isPrivate: true, hostConnected: true },
                    ],
                    hasMore: false,
                },
            });
            expect(searched.body).toEqual({ rooms: [expect.objectContaining({ roomName: listed })], hasMore: false });
            expect(searchedById.body).toEqual({ rooms: [expect.objectContaining({ roomName: listed })], hasMore: false });
            // Never the search of a visitor, like the access logs on AWS
            expect(vi.mocked(console.log)).toHaveBeenCalledWith('GET /rooms: 200');
            expect(vi.mocked(console.log).mock.calls.flat().join('\n')).not.toContain('Chat-L');
            const visitor = await connected();
            expect(await reply(visitor, 'join', { roomName: listed, game: 'chess', playerName: 'bob', password: 'secret', token: 'bob-token', browserId: 'bob-browser' }))
                .toMatchObject({ type: 'error', data: { message: 'Room of another game' } });
            expect(await reply(visitor, 'join', { roomName: listed, game: 'chat', playerName: 'bob', password: 'wrong', token: 'bob-token', browserId: 'bob-browser' }))
                .toMatchObject({ type: 'error', data: { message: 'Wrong password' } });
            expect(await reply(visitor, 'join', { roomName: listed, game: 'chat', playerName: 'bob', password: 'secret', token: 'bob-token', browserId: 'bob-browser' }))
                .toMatchObject({ type: 'joiningRoom', data: { playerName: 'alice' } });
        });

        test('should refuse the passwords of a client for a while once it gave too many wrong ones, by its IP', async () => {
            // Given
            const roomName = await createRoom(await connected(), { roomName: 'locked', maxPlayer: 2, game: 'chess', password: 'secret', playerName: 'alice', token: 'alice-token', browserId: 'alice-browser' });
            const guesser = await connected();
            for (let attempt = 0; attempt < 5; attempt++) {
                expect(await reply(guesser, 'join', { roomName, game: 'chess', playerName: 'bob', password: `guess-${ attempt }`, token: 'bob-token', browserId: 'bob-browser' }))
                    .toMatchObject({ data: { message: 'Wrong password' } });
            }

            // When
            const refused = await reply(guesser, 'join', { roomName, game: 'chess', playerName: 'bob', password: 'secret', token: 'bob-token', browserId: 'bob-browser' });

            // Then
            expect(refused).toMatchObject({ type: 'error', data: { message: 'Too many password attempts' } });
        });

        test('should check 5 passwords at most of a client sending them all at once', async () => {
            // Given
            const roomName = await createRoom(await connected(), { roomName: 'rushed', maxPlayer: 2, game: 'chess', password: 'secret', playerName: 'alice', token: 'alice-token', browserId: 'alice-browser' });
            const guessers = await Promise.all(Array.from({ length: 8 }, () => connected()));

            // When
            const replies = await Promise.all(guessers.map((guesser: WebSocket, attempt: number) =>
                reply(guesser, 'join', { roomName, game: 'chess', playerName: `bob-${ attempt }`, password: `guess-${ attempt }`, token: 'bob-token', browserId: 'bob-browser' })));

            // Then
            const messages: unknown[] = replies.map(({ data }: { data: Record<string, unknown> }) => data['message']);
            expect(messages.filter((message: unknown) => message === 'Wrong password')).toHaveLength(5);
            expect(messages.filter((message: unknown) => message === 'Too many password attempts')).toHaveLength(3);
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

        test('should refuse the connection of a client out of the game app, without $disconnect', async () => {
            // When
            const response = await rawHandshake(api, HANDSHAKE.replace(`Origin: ${ APP_ORIGIN }\r\n`, ''));

            // Then
            expect(response).toMatch(/^HTTP\/1\.1 403 Forbidden\r\n/);
            expect(routeRuns('$connect')).toHaveLength(1);
            expect(routeRuns('$disconnect')).not.toContain(routeRuns('$connect')[0]);
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

    describe('HTTP API', () => {
        test('should answer a refused request, readable by the game app', async () => {
            expect(await sendHttp(api, 'GET', '/rooms?game=go'))
                .toEqual({ status: 400, contentType: 'application/json', allowedOrigin: APP_ORIGIN, allowedMethods: undefined, body: { message: 'Payload not valid' } });
        });

        test('should be readable by the game app served on 127.0.0.1', async () => {
            expect(await sendHttp(api, 'GET', '/rooms?game=go', { Origin: 'http://127.0.0.1:4200' })).toMatchObject({ status: 400, allowedOrigin: 'http://127.0.0.1:4200' });
        });

        test.each([
            ['a page of another domain', 'https://attacker.test'],
            ['a page of another protocol', 'https://localhost:4200'],
            ['a page of another port', 'http://localhost:4201'],
        ])('should refuse %s, unreadable', async (_case: string, origin: string) => {
            expect(await sendHttp(api, 'GET', '/rooms?game=chat', { Origin: origin }))
                .toEqual({ status: 403, contentType: 'application/json', allowedOrigin: undefined, allowedMethods: undefined, body: { message: 'Forbidden' } });
        });

        test('should refuse a client out of a browser, without Origin', async () => {
            expect(await sendHttp(api, 'GET', '/rooms?game=chat', {})).toMatchObject({ status: 403, body: { message: 'Forbidden' } });
        });

        test.each<[string, string, string, Record<string, string>]>([
            ['another method', 'POST', '/rooms?game=chat', { Origin: APP_ORIGIN }],
            ['a preflight, refused like the ones of PostToConnection', 'OPTIONS', '/rooms?game=chat', { 'Access-Control-Request-Method': 'GET', Origin: APP_ORIGIN }],
            ['another path', 'GET', '/rooms/chat', { Origin: APP_ORIGIN }],
        ])('should answer not found to %s, through the lambda', async (_case: string, method: string, path: string, headers: Record<string, string>) => {
            expect(await sendHttp(api, method, path, headers))
                .toEqual({ status: 404, contentType: 'application/json', allowedOrigin: APP_ORIGIN, allowedMethods: undefined, body: { message: 'Not found' } });
        });

        test('should answer a server error readable by the game app when the lambda fails', async () => {
            // Given
            vi.mocked(httpApi).mockRejectedValueOnce(new Error('The lambda failed'));

            // When / Then
            expect(await sendHttp(api, 'GET', '/rooms?game=chat'))
                .toEqual({ status: 500, contentType: undefined, allowedOrigin: APP_ORIGIN, allowedMethods: undefined, body: undefined });
        });
    });

    describe('origins of the game app given', () => {
        test('should answer the game app served on the origins given only, read at each request', async () => {
            // Given: the game app served on another port
            const otherOrigin: string = 'http://localhost:4300';
            vi.stubEnv('ALLOWED_ORIGINS', otherOrigin);

            // When / Then
            expect(await sendHttp(api, 'GET', '/rooms?game=go', { Origin: otherOrigin })).toMatchObject({ status: 400, allowedOrigin: otherOrigin });
            expect(await sendHttp(api, 'GET', '/rooms?game=go', { Origin: APP_ORIGIN })).toMatchObject({ status: 403, allowedOrigin: undefined });
            expect(await rawHandshake(api, HANDSHAKE.replace(APP_ORIGIN, otherOrigin), (client: Socket) => client.destroy()))
                .toMatch(/^HTTP\/1\.1 101 /);
        });

        test('should answer a server error without origins given, and keep serving', async () => {
            // Given
            vi.stubEnv('ALLOWED_ORIGINS', '');
            vi.spyOn(console, 'error').mockImplementation(() => undefined);

            // When / Then
            expect(await sendHttp(api, 'GET', '/rooms?game=chess')).toMatchObject({ status: 500, allowedOrigin: undefined });
            vi.stubEnv('ALLOWED_ORIGINS', APP_ORIGIN);
            expect(await sendHttp(api, 'GET', '/rooms?game=chess')).toMatchObject({ status: 200, allowedOrigin: APP_ORIGIN });
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
