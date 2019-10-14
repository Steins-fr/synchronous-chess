import * as AWS from 'aws-sdk';
import PlayerDocument from './entities/player-document';
import RoomDocument from './entities/room-document';
import { AttributeMap } from './entities/types';
import SocketPayload from './interfaces/socket-payload';
import Room from './interfaces/room-request';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { PutItemInputAttributeMap } from 'aws-sdk/clients/dynamodb';
import JoinRequest from './interfaces/join-request';
import SignalRequest from './interfaces/signal-request';

interface Response {
    statusCode: number;
    body: string;
}

const ddb: AWS.DynamoDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

const TABLE_NAME: string = process.env.TABLE_NAME as string;

function errorResponse(message: string): string {
    return JSON.stringify({ // TODO: ErrorResponse
        type: 'error', data: JSON.stringify({
            message
        })
    });
}

function createPayloadValidation(payload: SocketPayload): boolean {
    if (payload.type !== 'create' || !payload.data) {
        return false;
    }

    try {
        const data: Room = JSON.parse(payload.data);
        if (!data.roomName || !data.maxPlayer || !data.playerName) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function roomExist(data: Room): Promise<boolean> {
    return new Promise<boolean>((resolve: (value: boolean) => void, reject: (value: AWS.AWSError) => void): void => {

        const keys: AWS.DynamoDB.Key & Partial<RoomDocument> = {
            ID: {
                S: data.roomName
            }
        };

        const params: AWS.DynamoDB.GetItemInput = {
            TableName: TABLE_NAME,
            Key: keys,
            ProjectionExpression: 'ID'
        };

        ddb.getItem(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.GetItemOutput) => {
            if (err) {
                reject(err);
            }

            resolve(!!roomData.Item);
        });
    });
}

type UpdatePutItemOutput = AWS.DynamoDB.UpdateItemOutput | AWS.DynamoDB.PutItemOutput;

function genUpdatePutCallback(resolve: (value: UpdatePutItemOutput) => void,
    reject: (value: AWS.AWSError) => void): (err: AWS.AWSError, output: UpdatePutItemOutput) => void {
    return (err: AWS.AWSError, output: UpdatePutItemOutput): void => {
        if (err) {
            reject(err);
        }
        resolve(output);
    };
}

function createRoom(data: Room, connectionId: string): Promise<AWS.DynamoDB.PutItemOutput> {
    return new Promise((resolve: (value: AWS.DynamoDB.PutItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {
        const item: PutItemInputAttributeMap & RoomDocument = {
            ID: { S: data.roomName },
            connectionId: { S: connectionId },
            hostPlayer: { S: data.playerName },
            maxPlayer: { N: `${data.maxPlayer}` },
            players: {
                L: [
                    { M: { playerName: { S: data.playerName }, connectionId: { S: connectionId } } }
                ]
            },
            queue: { L: [] }
        };

        const putParams: AWS.DynamoDB.PutItemInput = {
            TableName: TABLE_NAME,
            Item: item
        };

        ddb.putItem(putParams, genUpdatePutCallback(resolve, reject));
    });
}

function getRoom(roomName: string): Promise<RoomDocument> {
    return new Promise((resolve: (value: any) => void, reject: (value: AWS.AWSError) => void): void => { // TYPEDEF
        const params: AWS.DynamoDB.GetItemInput = {
            TableName: TABLE_NAME,
            Key: {
                ID: {
                    S: roomName
                }
            },
            ProjectionExpression: 'ID, connectionId, players, queue, hostPlayer, maxPlayer'
        };

        ddb.getItem(params, (err: AWS.AWSError, roomData: AWS.DynamoDB.GetItemOutput) => {
            if (err) {
                reject(err);
            }

            resolve(roomData.Item);
        });
    });
}

async function messageCreate(event: APIGatewayProxyEvent, payload: SocketPayload): Promise<void> {
    if (!createPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data: any = JSON.parse(payload.data); // TYPEDEF

    if (await roomExist(data)) {
        throw new Error('Room already exists');
    }
    const connectionId: string = event.requestContext.connectionId as string;

    await createRoom(data, connectionId);
    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    // TODO: CreateResponse
    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify({ type: 'created', data: JSON.stringify(data) }) }).promise();
}

function joinPayloadValidation(payload: SocketPayload): boolean {
    if (payload.type !== 'join' || !payload.data) {
        return false;
    }

    try {
        const data: JoinRequest = JSON.parse(payload.data);
        if (!data.roomName || !data.playerName) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function addRoomQueue(data: JoinRequest, connectionId: string): Promise<AWS.DynamoDB.UpdateItemOutput> {
    return new Promise((resolve: (value: AWS.DynamoDB.UpdateItemOutput) => void, reject: (value: AWS.AWSError) => void): void => {

        const updateParams: AWS.DynamoDB.UpdateItemInput = {
            TableName: TABLE_NAME,
            Key: {
                ID: { S: data.roomName }
            },
            UpdateExpression: 'set queue = list_append(queue, :items)',
            ExpressionAttributeValues: {
                ':items': { L: [{ M: { playerName: { S: data.playerName }, connectionId: { S: connectionId } } }] }
            }
        };

        ddb.updateItem(updateParams, genUpdatePutCallback(resolve, reject));
    });
}

function findPlayerWith(players: Array<AttributeMap<PlayerDocument>>, test: (player: PlayerDocument) => boolean): PlayerDocument | null {
    for (let i: number = 0; i < players.length; ++i) {
        const player: PlayerDocument = players[i].M;
        if (test(player)) {
            return player;
        }
    }
    return null;
}

function findPlayerByName(players: Array<AttributeMap<PlayerDocument>>, playerName: string): PlayerDocument | null {
    const playerNameTest: (player: PlayerDocument) => boolean = (player: PlayerDocument): boolean => player.playerName.S === playerName;
    return findPlayerWith(players, playerNameTest);
}

function findPlayerConnectionId(players: Array<AttributeMap<PlayerDocument>>, connectionId: string): PlayerDocument | null {
    const connectionIdTest: (player: PlayerDocument) => boolean = (player: PlayerDocument): boolean => player.connectionId.S === connectionId;
    return findPlayerWith(players, connectionIdTest);
}

function getPlayerByName(room: RoomDocument, playerName: string): PlayerDocument | null {
    return findPlayerByName(room.players.L, playerName) || findPlayerByName(room.queue.L, playerName);
}

function getPlayerByConnectionId(room: RoomDocument, connectionId: string): PlayerDocument | null {
    return findPlayerConnectionId(room.players.L, connectionId) || findPlayerConnectionId(room.queue.L, connectionId);
}

function isInQueue(room: RoomDocument, playerName: string): boolean {
    return !!findPlayerByName(room.queue.L, playerName);
}

function isInGame(room: RoomDocument, playerName: string): boolean {
    return !!findPlayerByName(room.players.L, playerName);
}

function joinHostResponse(data: JoinRequest): string {
    return JSON.stringify({ // TODO: JoinResponse1
        type: 'joinRequest', data: JSON.stringify({
            playerName: data.playerName // TODO: Replace by generated playerId
        })
    });
}

function joinResponse(room: RoomDocument): string {
    return JSON.stringify({ // TODO: JoinResponse2
        type: 'joiningRoom', data: JSON.stringify({
            playerName: room.hostPlayer.S,
            roomName: room.ID.S
        })
    });
}

async function messageJoin(event: APIGatewayProxyEvent, payload: SocketPayload): Promise<void> {
    if (!joinPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data: JoinRequest = JSON.parse(payload.data);
    const room: RoomDocument = await getRoom(data.roomName);

    if (!room) {
        throw new Error('Room does not exist');
    }

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const connectionId: string = event.requestContext.connectionId as string;
    if (isInGame(room, data.playerName)) {
        await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: errorResponse('Already in game') }).promise();
        return;
    }

    if (isInQueue(room, data.playerName)) {
        await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: errorResponse('Already in queue') }).promise();
        return;
    }
    await addRoomQueue(data, connectionId);

    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: joinResponse(room) }).promise();
    await apigwManagementApi.postToConnection({ ConnectionId: room.connectionId.S, Data: joinHostResponse(data) }).promise();
}

function signalPayloadValidation(payload: SocketPayload): boolean {
    if (payload.type !== 'signal' || !payload.data) {
        return false;
    }

    try {
        const data: SignalRequest = JSON.parse(payload.data);
        if (!data.roomName || !data.to || !data.signal) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function signalResponse(data: SignalRequest, fromPlayer: PlayerDocument): string {
    return JSON.stringify({ // TODO: SignalResponse
        type: 'remoteSignal', data: JSON.stringify({
            from: fromPlayer.playerName.S,
            signal: data.signal
        })
    });
}

async function messageSignal(event: APIGatewayProxyEvent, payload: SocketPayload): Promise<void> {
    if (!signalPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data: SignalRequest = JSON.parse(payload.data);

    const room: RoomDocument = await getRoom(data.roomName);

    if (!room) {
        throw new Error('Room does not exist');
    }

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const fromConnectionId: string = event.requestContext.connectionId as string;
    const fromPlayer: PlayerDocument | null = getPlayerByConnectionId(room, fromConnectionId);
    const toPlayer: PlayerDocument | null = getPlayerByName(room, data.to);

    if (fromPlayer === null) {
        await apigwManagementApi.postToConnection({ ConnectionId: fromConnectionId, Data: errorResponse('You was not in the queue!') }).promise();
        return;
    }

    if (toPlayer === null) {
        await apigwManagementApi.postToConnection({ ConnectionId: fromConnectionId, Data: errorResponse('No destination found!') }).promise();
        return;
    }

    await apigwManagementApi.postToConnection({ ConnectionId: toPlayer.connectionId.S, Data: signalResponse(data, fromPlayer) }).promise();
}

interface MessageHandlers {
    [type: string]: (event: APIGatewayProxyEvent, payload: SocketPayload) => Promise<void>;
}

export const handler: (event: APIGatewayProxyEvent) => Promise<Response> = async function (event: APIGatewayProxyEvent): Promise<Response> {

    const messageHandlers: MessageHandlers = {
        create: messageCreate,
        join: messageJoin,
        signal: messageSignal
    };

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const body: string = event.body as string;

    const payload: SocketPayload = JSON.parse(JSON.parse(body).data);
    const connectionId: string = event.requestContext.connectionId as string;

    if (messageHandlers[payload.type]) {
        try {
            await messageHandlers[payload.type](event, payload);
        } catch (e) {
            await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: errorResponse(e.message) }).promise();
            return { statusCode: 500, body: e.stack };
        }
    } else {
        return { statusCode: 401, body: 'Operation not permitted.' };
    }

    return { statusCode: 200, body: 'Data sent.' };
};
