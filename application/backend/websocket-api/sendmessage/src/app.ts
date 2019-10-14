import * as AWS from 'aws-sdk';

interface Response {
    statusCode: number;
    body: string;
}

const ddb: AWS.DynamoDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

const TABLE_NAME: string = process.env.TABLE_NAME as string;

function createPayloadValidation(payload: any): boolean { // TYPEDEF
    if (payload.type !== 'create' || !payload.data) {
        return false;
    }

    try {
        const data: any = JSON.parse(payload.data); // TYPEDEF
        if (!data.roomName || !data.maxPlayer || !data.playerName) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function roomExist(data: any): Promise<any> { // TYPEDEF // TYPEDEF
    return new Promise((resolve: (value?: any) => void, reject: (value?: any) => void): void => { // TYPEDEF
        const params: any = { // TYPEDEF
            TableName: TABLE_NAME,
            Key: {
                ID: {
                    S: data.roomName
                }
            },
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

function createRoom(data: any, connectionId: string): Promise<any> { // TYPEDEF // TYPEDEF
    return new Promise((resolve: (value?: any) => void, reject: (value?: any) => void): void => {
        const putParams: any = { // TYPEDEF
            TableName: process.env.TABLE_NAME,
            Item: {
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
            }
        };

        ddb.putItem(putParams, function (err: AWS.AWSError): void {
            if (err) {
                reject(err);
            }
            resolve();
        });
    });
}

function getRoom(data: any): Promise<any> { // TYPEDEF // TYPEDEF
    return new Promise((resolve: (value?: any) => void, reject: (value?: any) => void): void => {
        const params: any = { // TYPEDEF
            TableName: TABLE_NAME,
            Key: {
                ID: {
                    S: data.roomName
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

async function messageCreate(event: any, payload: any): Promise<void> { // TYPEDEF
    if (!createPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data: any = JSON.parse(payload.data); // TYPEDEF

    if (await roomExist(data)) {
        throw new Error('Room already exists');
    }
    const connectionId: string = event.requestContext.connectionId;
    await createRoom(data, connectionId);
    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify({ type: 'created', data: JSON.stringify(data) }) }).promise();
}

function joinPayloadValidation(payload: any): boolean { // TYPEDEF
    if (payload.type !== 'join' || !payload.data) {
        return false;
    }

    try {
        const data: any = JSON.parse(payload.data); // TYPEDEF
        if (!data.roomName || !data.playerName) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function addRoomQueue(data: any, connectionId: string): Promise<any> { // TYPEDEF // TYPEDEF
    return new Promise((resolve: (value?: any) => void, reject: (value?: any) => void): void => {

        const updateParams: any = { // TYPEDEF
            TableName: process.env.TABLE_NAME,
            Key: {
                ID: { S: data.roomName }
            },
            UpdateExpression: 'set queue = list_append(queue, :items)',
            ExpressionAttributeValues: {
                ':items': { L: [{ M: { playerName: { S: data.playerName }, connectionId: { S: connectionId } } }] }
            }
        };

        ddb.updateItem(updateParams, function (err: AWS.AWSError): void {
            if (err) {
                reject(err);
            }
            resolve();
        });
    });
}

function isInQueue(room: any, playerName: string): boolean { // TYPEDEF

    let found: boolean = false;

    const queueArray: Array<any> = room.queue.L; // TYPEDEF
    queueArray.forEach((playerMap: any) => { // TYPEDEF
        const player: any = playerMap.M; // TYPEDEF
        const pName: string = player.playerName.S;
        if (pName === playerName) {
            found = true;
        }
    });

    return found;
}

function isInGame(room: any, playerName: string): boolean {

    let found: boolean = false;

    const playersArray: Array<any> = room.players.L; // TYPEDEF
    playersArray.forEach((playerMap: any) => { // TYPEDEF
        const player: any = playerMap.M; // TYPEDEF
        const pName: string = player.playerName.S;
        if (pName === playerName) {
            found = true;
        }
    });

    return found;
}

function joinHostResponse(data: any): string { // TYPEDEF
    return JSON.stringify({
        type: 'joinRequest', data: JSON.stringify({
            playerName: data.playerName // Replace by generated playerId
        })
    });
}

function joinResponse(room: any): string { // TYPEDEF
    return JSON.stringify({
        type: 'joiningRoom', data: JSON.stringify({
            playerName: room.hostPlayer.S,
            roomName: room.ID.S
        })
    });
}

async function messageJoin(event: any, payload: any): Promise<void> { // TYPEDEF // TYPEDEF
    if (!joinPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data: any = JSON.parse(payload.data); // TYPEDEF

    const room: any = await getRoom(data); // TYPEDEF

    if (!room) {
        throw new Error('Room does not exist');
    }

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const connectionId: string = event.requestContext.connectionId;
    if (isInGame(room, data.playerName)) {
        await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify({ type: 'error', data: 'Already in game' }) }).promise();
        return;
    }

    if (!isInQueue(room, data.playerName)) {
        await addRoomQueue(data, connectionId);
    }

    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: joinResponse(room) }).promise();
    await apigwManagementApi.postToConnection({ ConnectionId: room.connectionId.S, Data: joinHostResponse(data) }).promise();
}

function signalPayloadValidation(payload: any): boolean { // TYPEDEF
    if (payload.type !== 'signal' || !payload.data) {
        return false;
    }

    try {
        const data: any = JSON.parse(payload.data); // TYPEDEF
        if (!data.roomName || !data.to || !data.signal) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function getPlayerByName(room: any, playerName: string): any { // TYPEDEF // TYPEDEF

    const playersArray: Array<any> = room.players.L; // TYPEDEF
    for (let i: number = 0; i < playersArray.length; ++i) {
        const player: any = playersArray[i].M; // TYPEDEF
        const pName: string = player.playerName.S;
        if (pName === playerName) {
            return player;
        }
    }

    const queueArray: Array<any> = room.queue.L; // TYPEDEF
    for (let i: number = 0; i < queueArray.length; ++i) {
        const player: any = queueArray[i].M; // TYPEDEF
        const pName: string = player.playerName.S;
        if (pName === playerName) {
            return player;
        }
    }

    return null;
}

function getPlayerByConnectionId(room: any, connectionId: string): any { // TYPEDEF // TYPEDEF

    const playersArray: Array<any> = room.players.L; // TYPEDEF
    for (let i: number = 0; i < playersArray.length; ++i) {
        const player: any = playersArray[i].M; // TYPEDEF
        const cId: string = player.connectionId.S;
        if (cId === connectionId) {
            return player;
        }
    }

    const queueArray: Array<any> = room.queue.L; // TYPEDEF
    for (let i: number = 0; i < queueArray.length; ++i) {
        const player: any = queueArray[i].M; // TYPEDEF
        const cId: string = player.connectionId.S;
        if (cId === connectionId) {
            return player;
        }
    }

    return null;
}

function signalResponse(data: any, fromPlayer: any): string { // TYPEDEF // TYPEDEF
    return JSON.stringify({
        type: 'remoteSignal', data: JSON.stringify({
            from: fromPlayer.playerName.S,
            signal: data.signal
        })
    });
}

async function messageSignal(event: any, payload: any): Promise<void> { // TYPEDEF // TYPEDEF
    if (!signalPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data: any = JSON.parse(payload.data); // TYPEDEF

    const room: any = await getRoom(data); // TYPEDEF

    if (!room) {
        throw new Error('Room does not exist');
    }

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const fromConnectionId: string = event.requestContext.connectionId;
    const fromPlayer: any = getPlayerByConnectionId(room, fromConnectionId); // TYPEDEF
    const toPlayer: any = getPlayerByName(room, data.to); // TYPEDEF
    if (toPlayer === null) {
        await apigwManagementApi.postToConnection({ ConnectionId: fromConnectionId, Data: JSON.stringify({ type: 'error', data: 'No destination found!' }) }).promise();
        return;
    }

    await apigwManagementApi.postToConnection({ ConnectionId: toPlayer.connectionId.S, Data: signalResponse(data, fromPlayer) }).promise();
}

export const handler: (event: any) => Promise<Response> = async function (event: any): Promise<Response> { // TYPEDEF // TYPEDEF

    const messageHandlers: any = { // TYPEDEF
        create: messageCreate,
        join: messageJoin,
        signal: messageSignal
    };

    const apigwManagementApi: AWS.ApiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const payload: any = JSON.parse(JSON.parse(event.body).data); // TYPEDEF
    const connectionId: string = event.requestContext.connectionId;

    if (messageHandlers[payload.type]) {
        try {
            await messageHandlers[payload.type](event, payload);
        } catch (e) {
            await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify({ type: 'error', data: JSON.stringify(e.message) }) }).promise();
            return { statusCode: 500, body: e.stack };
        }
    } else {
        return { statusCode: 401, body: 'Operation not permitted.' };
    }

    return { statusCode: 200, body: 'Data sent.' };
};
