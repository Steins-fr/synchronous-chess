/**
 * The websocket API run locally, without AWS: API Gateway emulated around the lambdas, DynamoDB by dynalite, in
 * memory. Nothing is kept from one process to the next.
 */
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import dynalite from 'dynalite';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Duplex } from 'node:stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { RoomApiRoute } from '@protocol/room-api-route.enum';

interface LambdaResponse {
    statusCode: number;
    body: string;
}

type Lambda = (event: APIGatewayProxyEvent) => Promise<LambdaResponse>;

interface Lambdas {
    onConnect: Lambda;
    onDisconnect: Lambda;
    sendMessage: Lambda;
}

export interface LocalApiOptions {
    /** 0 for a free port */
    port: number;
    /** 10 minutes by default, like API Gateway */
    idleTimeoutMs?: number;
    /** 2 hours by default, like API Gateway */
    maxConnectionMs?: number;
}

export interface LocalApi {
    readonly port: number;
    /** The websocket URL of the API */
    readonly endpoint: string;
    readonly dynamoEndpoint: string;
    close(): Promise<void>;
}

// Loopback only: the API has no authentication, nor the PostToConnection endpoint and the tables
const HOST: string = '127.0.0.1';
// The maximum size of a message API Gateway posts to a connection
const MAX_MESSAGE_BYTES: number = 128 * 1024;
// The maximum size of a frame API Gateway receives. The browsers send each message in a single frame, so it limits
// their messages (ws cannot limit the frames apart from the messages)
const MAX_FRAME_BYTES: number = 32 * 1024;
// API Gateway closes a connection without message, in either direction, for 10 minutes, and any after 2 hours
const IDLE_TIMEOUT_MS: number = 10 * 60 * 1000;
const MAX_CONNECTION_MS: number = 2 * 60 * 60 * 1000;
const GOING_AWAY: number = 1001;
const CONNECTIONS_PATH: RegExp = /^\/@connections\/([^/]+)$/;

function listen(httpServer: Server, port: number): Promise<number> {
    return new Promise((resolve: (port: number) => void, reject: (error: Error) => void): void => {
        httpServer.once('error', reject);
        httpServer.listen(port, HOST, (): void => resolve((httpServer.address() as AddressInfo).port));
    });
}

/** Starts DynamoDB and loads the lambdas, which read the environment when they load */
async function loadLambdas(): Promise<Lambdas> {
    const dynamoServer: Server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
    const dynamoPort: number = await listen(dynamoServer, 0);
    // Shared by the APIs of the process: does not keep it alive on its own
    dynamoServer.unref();

    Object.assign(process.env, {
        AWS_REGION: 'eu-west-3',
        AWS_ACCESS_KEY_ID: 'local',
        AWS_SECRET_ACCESS_KEY: 'local',
        AWS_ENDPOINT_URL_DYNAMODB: `http://${HOST}:${dynamoPort}`,
        TABLE_NAME_CONNECTIONS: 'connections',
        TABLE_NAME_ROOMS: 'rooms',
    });

    // The tables of infrastructure/main.tf
    const dynamo: DynamoDBClient = new DynamoDBClient();
    await Promise.all([
        [process.env.TABLE_NAME_ROOMS, 'id'],
        [process.env.TABLE_NAME_CONNECTIONS, 'connectionId'],
    ].map(([tableName, key]: string[]): Promise<unknown> => dynamo.send(new CreateTableCommand({
        TableName: tableName,
        KeySchema: [{ AttributeName: key, KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: key, AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
    }))));

    const { handler: onConnect }: { handler: Lambda } = await import('../lambdas/onconnect/app');
    const { handler: onDisconnect }: { handler: Lambda } = await import('../lambdas/ondisconnect/app');
    const { handler: sendMessage }: { handler: Lambda } = await import('../lambdas/sendmessage/app');

    return { onConnect, onDisconnect, sendMessage };
}

let lambdas: Promise<Lambdas> | undefined;

/**
 * Runs a lambda with the event of a websocket route, with only what the lambdas read: no domain name, the
 * lambdas reach the management API through MANAGEMENT_API_ENDPOINT
 * @returns the status code of the lambda, 500 when it throws
 */
async function invoke(routeKey: string, lambda: Lambda, connectionId: string, body: string | null = null): Promise<number> {
    const event = { body, requestContext: { connectionId, routeKey } } as unknown as APIGatewayProxyEvent;

    try {
        const response: LambdaResponse = await lambda(event);
        console.log(`${routeKey} ${connectionId}: ${response.statusCode} ${response.body}`);
        return response.statusCode;
    } catch (e) {
        console.error(`${routeKey} ${connectionId}: lambda failed`, e);
        return 500;
    }
}

function routeOf(body: string): unknown {
    try {
        return (JSON.parse(body) as { message?: unknown }).message;
    } catch {
        return undefined;
    }
}

/** @returns the body of the request, undefined as soon as it grows larger than the maximum size of a message */
function readBody(request: IncomingMessage): Promise<string | undefined> {
    return new Promise((resolve: (body: string | undefined) => void, reject: (error: Error) => void): void => {
        const chunks: Buffer[] = [];
        let size: number = 0;
        const onData = (chunk: Buffer): void => {
            size += chunk.length;
            if (size > MAX_MESSAGE_BYTES) {
                request.off('data', onData);
                request.pause();
                resolve(undefined);
                return;
            }
            chunks.push(chunk);
        };
        request.on('data', onData);
        request.on('end', (): void => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

/** An error of the management API, with the type the SDK reads to throw its exception */
function replyError(response: ServerResponse, statusCode: number, errorType: string, message: string): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json', 'x-amzn-ErrorType': errorType })
        .end(JSON.stringify({ message }));
}

/** @returns the connection id of the path, undefined when not properly encoded */
function decodeConnectionId(encodedConnectionId: string): string | undefined {
    try {
        return decodeURIComponent(encodedConnectionId);
    } catch {
        return undefined;
    }
}

interface Connection {
    socket: WebSocket;
    // Refreshed by each message, in either direction
    idleTimer: NodeJS.Timeout;
}

/** A connection until its handshake completes */
interface PendingConnection {
    // Set once $connect accepted it
    connectionId?: string;
    // The client left: before $connect returns when it resets the connection
    closed: boolean;
}

/**
 * Starts the API, with its own connections. The lambdas reach the API started last: one at a time in a process
 */
export async function startLocalApi(options: LocalApiOptions): Promise<LocalApi> {
    lambdas ??= loadLambdas();
    const { onConnect, onDisconnect, sendMessage }: Lambdas = await lambdas;
    const idleTimeoutMs: number = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    const maxConnectionMs: number = options.maxConnectionMs ?? MAX_CONNECTION_MS;
    const connections: Map<string, Connection> = new Map<string, Connection>();
    const pendingConnections: WeakMap<IncomingMessage, PendingConnection> = new WeakMap<IncomingMessage, PendingConnection>();
    let port: number = options.port;

    /** The PostToConnection endpoint of the API Gateway management API, used by the lambdas to reach the clients */
    async function postToConnection(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const connectionId: string | undefined = CONNECTIONS_PATH.exec(request.url ?? '')?.[1];

        if (request.method !== 'POST' || connectionId === undefined) {
            response.writeHead(404).end();
            return;
        }

        // Signed like the requests of the SDK, which a web page cannot send without a preflight this server never
        // answers, and to this host: a page of another domain resolved to the loopback (DNS rebinding) sends its own
        if (request.headers.host !== `${HOST}:${port}` || !request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ')) {
            replyError(response, 403, 'ForbiddenException', 'Missing Authentication Token');
            return;
        }

        const decodedConnectionId: string | undefined = decodeConnectionId(connectionId);
        if (decodedConnectionId === undefined) {
            replyError(response, 400, 'BadRequestException', 'Invalid connectionId');
            return;
        }

        const body: string | undefined = await readBody(request);
        if (body === undefined) {
            // The rest of the body is not read: the request is cut once answered
            response.once('finish', (): void => {
                request.destroy();
            });
            replyError(response, 413, 'PayloadTooLargeException', 'Message too long');
            return;
        }

        const connection: Connection | undefined = connections.get(decodedConnectionId);
        if (connection?.socket.readyState !== WebSocket.OPEN) {
            replyError(response, 410, 'GoneException', 'Connection gone');
            return;
        }

        connection.socket.send(body);
        connection.idleTimer.refresh();
        response.writeHead(200).end();
    }

    /**
     * An opened connection: its messages run the sendmessage route, its closing the $disconnect route. Closed like API
     * Gateway once idle or too old
     */
    function connect(connectionId: string, socket: WebSocket): void {
        const idleTimer: NodeJS.Timeout = setTimeout((): void => socket.close(GOING_AWAY, 'Going away'), idleTimeoutMs);
        const lifetimeTimer: NodeJS.Timeout = setTimeout((): void => socket.close(GOING_AWAY, 'Going away'), maxConnectionMs);
        connections.set(connectionId, { socket, idleTimer });

        // A Buffer, the binary type of the socket being the default `nodebuffer`
        socket.on('message', (data: RawData): void => {
            idleTimer.refresh();
            const body: string = (data as Buffer).toString('utf8');

            // Selected by `$request.body.message` like API Gateway (see infrastructure/modules/aws-api-gateway-routes).
            // A ping runs a mock integration without response there: nothing to do
            const route: unknown = routeOf(body);

            if (route === RoomApiRoute.SEND_MESSAGE) {
                void invoke(RoomApiRoute.SEND_MESSAGE, sendMessage, connectionId, body);
            } else if (route !== RoomApiRoute.PING) {
                // What API Gateway answers to a message matching no route, without $default route
                console.warn(`No route for the message of ${connectionId}: ${body}`);
                socket.send(JSON.stringify({ message: 'Forbidden', connectionId, requestId: randomUUID() }));
            }
        });

        // A message too long or not UTF-8: ws closes the connection, and would crash the server without listener
        socket.on('error', (e: Error): void => console.error(`Websocket ${connectionId} failed`, e));

        socket.on('close', (): void => {
            clearTimeout(idleTimer);
            clearTimeout(lifetimeTimer);
            connections.delete(connectionId);
            void invoke('$disconnect', onDisconnect, connectionId);
        });
    }

    /** Like API Gateway, runs $connect once the handshake is valid (checked by ws before), and refuses it with its status code */
    async function verifyConnection(request: IncomingMessage, accept: (accepted: boolean, statusCode: number) => void): Promise<void> {
        const connectionId: string = randomUUID();
        const statusCode: number = await invoke('$connect', onConnect, connectionId);
        const accepted: boolean = statusCode >= 200 && statusCode < 300;
        const pending: PendingConnection = pendingConnections.get(request) as PendingConnection;

        if (accepted && pending.closed) {
            void invoke('$disconnect', onDisconnect, connectionId);
        } else if (accepted) {
            pending.connectionId = connectionId;
        }

        accept(accepted, statusCode);
    }

    const webSocketServer: WebSocketServer = new WebSocketServer({
        noServer: true,
        maxPayload: MAX_FRAME_BYTES,
        // Two parameters: ws waits for the callback
        verifyClient: (info: { req: IncomingMessage }, accept: (accepted: boolean, statusCode: number) => void): void => {
            void verifyConnection(info.req, accept);
        },
    });

    const server: Server = createServer((request: IncomingMessage, response: ServerResponse): void => {
        postToConnection(request, response).catch((e: unknown): void => {
            console.error('PostToConnection failed', e);
            if (!response.headersSent) {
                response.writeHead(500);
            }
            response.end();
        });
    });

    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
        const pending: PendingConnection = { closed: false };
        pendingConnections.set(request, pending);

        // A connection $connect accepted but that never opens (the client left during $connect) runs $disconnect, to
        // keep each $connect paired with a $disconnect: here when it closes after $connect, in verifyConnection before
        const onClose = (): void => {
            pending.closed = true;
            if (pending.connectionId !== undefined) {
                void invoke('$disconnect', onDisconnect, pending.connectionId);
            }
        };
        socket.once('close', onClose);

        webSocketServer.handleUpgrade(request, socket, head, (webSocket: WebSocket): void => {
            socket.off('close', onClose);
            connect(pending.connectionId as string, webSocket);
        });
    });

    port = await listen(server, options.port);
    process.env.MANAGEMENT_API_ENDPOINT = `http://${HOST}:${port}`;

    return {
        port,
        endpoint: `ws://${HOST}:${port}`,
        dynamoEndpoint: process.env['AWS_ENDPOINT_URL_DYNAMODB'] as string,
        close: (): Promise<void> => new Promise((resolve: () => void): void => {
            for (const { socket } of connections.values()) {
                socket.terminate();
            }
            server.closeAllConnections();
            server.close((): void => resolve());
        }),
    };
}
