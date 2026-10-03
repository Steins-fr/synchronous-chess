/**
 * The websocket API run locally, without AWS (`npm run serve:local`): API Gateway emulated around the lambdas,
 * DynamoDB by dynalite, in memory. Nothing is kept from one run to the next.
 */
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import dynalite from 'dynalite';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { RawData, WebSocket, WebSocketServer } from 'ws';

interface LambdaResponse {
    statusCode: number;
    body: string;
}

type Lambda = (event: APIGatewayProxyEvent) => Promise<LambdaResponse>;

// The websocket server of the game app in its local configuration (environment.local.ts)
const API_PORT: number = 3001;
// The route of the requests, selected by `$request.body.message` like API Gateway (see infrastructure/modules/aws-api-gateway)
const SEND_MESSAGE_ROUTE: string = 'sendmessage';
// The maximum size of a message API Gateway accepts
const MAX_MESSAGE_BYTES: number = 128 * 1024;
const CONNECTIONS_PATH: RegExp = /^\/@connections\/([^/]+)$/;

function listen(httpServer: Server, port: number): Promise<number> {
    return new Promise((resolve: (port: number) => void, reject: (error: Error) => void): void => {
        httpServer.once('error', reject);
        httpServer.listen(port, (): void => resolve((httpServer.address() as AddressInfo).port));
    });
}

const dynamoPort: number = await listen(dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 }), 0);

// Read by the SDK clients and the repositories when the lambdas load: set before importing them
Object.assign(process.env, {
    AWS_REGION: 'eu-west-3',
    AWS_ACCESS_KEY_ID: 'local',
    AWS_SECRET_ACCESS_KEY: 'local',
    AWS_ENDPOINT_URL_DYNAMODB: `http://localhost:${dynamoPort}`,
    TABLE_NAME_CONNECTIONS: 'connections',
    TABLE_NAME_ROOMS: 'rooms',
    MANAGEMENT_API_ENDPOINT: `http://localhost:${API_PORT}`,
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

const sockets: Map<string, WebSocket> = new Map<string, WebSocket>();

/** Runs a lambda with the event of a websocket route, with only what the lambdas read */
async function invoke(routeKey: string, lambda: Lambda, connectionId: string, body: string | null = null): Promise<void> {
    const event = { body, requestContext: { connectionId, routeKey, domainName: `localhost:${API_PORT}` } } as unknown as APIGatewayProxyEvent;

    try {
        const response: LambdaResponse = await lambda(event);
        console.log(`${routeKey} ${connectionId}: ${response.statusCode} ${response.body}`);
    } catch (e) {
        console.error(`${routeKey} ${connectionId}: lambda failed`, e);
    }
}

function routeOf(body: string): unknown {
    try {
        return (JSON.parse(body) as { message?: unknown }).message;
    } catch {
        return undefined;
    }
}

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve: (body: string) => void, reject: (error: Error) => void): void => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer): number => chunks.push(chunk));
        request.on('end', (): void => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

/** The PostToConnection endpoint of the API Gateway management API, used by the lambdas to reach the clients */
async function postToConnection(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const connectionId: string | undefined = CONNECTIONS_PATH.exec(request.url ?? '')?.[1];
    const body: string = await readBody(request);

    if (request.method !== 'POST' || connectionId === undefined) {
        response.writeHead(404).end();
        return;
    }

    const socket: WebSocket | undefined = sockets.get(decodeURIComponent(connectionId));
    if (socket?.readyState !== WebSocket.OPEN) {
        // The error the SDK reads as a GoneException
        response.writeHead(410, { 'Content-Type': 'application/json', 'x-amzn-ErrorType': 'GoneException' })
            .end(JSON.stringify({ message: 'Connection gone' }));
        return;
    }

    socket.send(body);
    response.writeHead(200).end();
}

const server: Server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    postToConnection(request, response).catch((e: unknown): void => {
        console.error('PostToConnection failed', e);
        response.writeHead(500).end();
    });
});

new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES }).on('connection', (socket: WebSocket): void => {
    const connectionId: string = randomUUID();
    sockets.set(connectionId, socket);
    void invoke('$connect', onConnect, connectionId);

    // A Buffer, the binary type of the socket being the default `nodebuffer`
    socket.on('message', (data: RawData): void => {
        const body: string = (data as Buffer).toString('utf8');

        if (routeOf(body) === SEND_MESSAGE_ROUTE) {
            void invoke(SEND_MESSAGE_ROUTE, sendMessage, connectionId, body);
        } else {
            console.warn(`No route for the message of ${connectionId}: ${body}`);
        }
    });

    socket.on('close', (): void => {
        sockets.delete(connectionId);
        void invoke('$disconnect', onDisconnect, connectionId);
    });
});

await listen(server, API_PORT);
console.log(`Websocket API listening on ws://localhost:${API_PORT} (DynamoDB on http://localhost:${dynamoPort})`);
