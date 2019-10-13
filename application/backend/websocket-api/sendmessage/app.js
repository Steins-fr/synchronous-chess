// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

const { TABLE_NAME_CONNECTIONS, TABLE_NAME_ROOMS } = process.env;

function createPayloadValidation(payload) {
    if (payload.type !== 'create' || !payload.data) {
        return false;
    }

    try {
        const data = JSON.parse(payload.data);
        if (!data.roomName || !data.maxPlayer || !data.playerName) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function roomExist(data) {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: TABLE_NAME_ROOMS,
            Key: {
                "ID": {
                    S: data.roomName
                }
            },
            ProjectionExpression: "ID"
        }

        ddb.getItem(params, (err, roomData) => {
            if (err) {
                reject(err);
            }

            resolve(!!roomData.Item);
        });
    });
}

function createRoom(data, connectionId) {
    return new Promise((resolve, reject) => {
        var putParams = {
            TableName: process.env.TABLE_NAME_ROOMS,
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

        ddb.putItem(putParams, function (err) {
            if (err) {
                reject(err);
            }
            resolve();
        });
    });
}

function getRoom(data) {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: TABLE_NAME_ROOMS,
            Key: {
                "ID": {
                    S: data.roomName
                }
            },
            ProjectionExpression: "ID, connectionId, players, queue, hostPlayer, maxPlayer"
        }

        ddb.getItem(params, (err, roomData) => {
            if (err) {
                reject(err);
            }

            resolve(roomData.Item);
        });
    });
}

async function messageCreate(event, payload) {
    if (!createPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data = JSON.parse(payload.data);

    if (await roomExist(data)) {
        throw new Error('Room already exists');
    }
    const connectionId = event.requestContext.connectionId;
    await createRoom(data, connectionId);
    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify({ type: 'created', data: JSON.stringify(data) }) }).promise();
}

function joinPayloadValidation(payload) {
    if (payload.type !== 'join' || !payload.data) {
        return false;
    }

    try {
        const data = JSON.parse(payload.data);
        if (!data.roomName || !data.playerName) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function addRoomQueue(data, connectionId) {
    return new Promise((resolve, reject) => {

        const updateParams = {
            TableName: process.env.TABLE_NAME_ROOMS,
            Key: {
                ID: { S: data.roomName }
            },
            UpdateExpression: "set queue = list_append(queue, :items)",
            ExpressionAttributeValues: {
                ":items": { L: [{ M: { playerName: { S: data.playerName }, connectionId: { S: connectionId } } }] }
            }
        };

        ddb.updateItem(updateParams, function (err) {
            if (err) {
                reject(err);
            }
            resolve();
        });
    });
}

function isInQueue(room, playerName) {

    let found = false;

    const queueArray = room.queue.L;
    queueArray.forEach((playerMap) => {
        const player = playerMap.M;
        const pName = player.playerName.S;
        if (pName === playerName) {
            found = true;
        }
    });

    return found;
}

function isInGame(room, playerName) {

    let found = false;

    const playersArray = room.players.L;
    playersArray.forEach((playerMap) => {
        const player = playerMap.M;
        const pName = player.playerName.S;
        if (pName === playerName) {
            found = true;
        }
    });

    return found;
}

function joinHostResponse(data) {
    return JSON.stringify({
        type: 'joinRequest', data: JSON.stringify({
            playerName: data.playerName // Replace by generated playerId
        })
    });
}

function joinResponse(room) {
    return JSON.stringify({
        type: 'joiningRoom', data: JSON.stringify({
            playerName: room.hostPlayer.S,
            roomName: room.ID.S
        })
    });
}

async function messageJoin(event, payload) {
    if (!joinPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data = JSON.parse(payload.data);

    const room = await getRoom(data);

    if (!room) {
        throw new Error('Room does not exist');
    }

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const connectionId = event.requestContext.connectionId;
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

function signalPayloadValidation(payload) {
    if (payload.type !== 'signal' || !payload.data) {
        return false;
    }

    try {
        const data = JSON.parse(payload.data);
        if (!data.roomName || !data.to || !data.signal) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;
}

function getPlayerByName(room, playerName) {

    const playersArray = room.players.L;
    for (let i = 0; i < playersArray.length; ++i) {
        const player = playersArray[i].M;
        const pName = player.playerName.S;
        if (pName === playerName) {
            return player;
        }
    }

    const queueArray = room.queue.L;
    for (let i = 0; i < queueArray.length; ++i) {
        const player = queueArray[i].M;
        const pName = player.playerName.S;
        if (pName === playerName) {
            return player;
        }
    }

    return null;
}

function getPlayerByConnectionId(room, connectionId) {

    const playersArray = room.players.L;
    for (let i = 0; i < playersArray.length; ++i) {
        const player = playersArray[i].M;
        const cId = player.connectionId.S;
        if (cId === connectionId) {
            return player;
        }
    }

    const queueArray = room.queue.L;
    for (let i = 0; i < queueArray.length; ++i) {
        const player = queueArray[i].M;
        const cId = player.connectionId.S;
        if (cId === connectionId) {
            return player;
        }
    }

    return null;
}

function signalResponse(data, fromPlayer) {
    return JSON.stringify({
        type: 'remoteSignal', data: JSON.stringify({
            from: fromPlayer.playerName.S,
            signal: data.signal
        })
    });
}

async function messageSignal(event, payload) {
    if (!signalPayloadValidation(payload)) {
        throw new Error('Payload not valid');
    }

    const data = JSON.parse(payload.data);

    const room = await getRoom(data);

    if (!room) {
        throw new Error('Room does not exist');
    }

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const fromConnectionId = event.requestContext.connectionId;
    const fromPlayer = getPlayerByConnectionId(room, fromConnectionId);
    const toPlayer = getPlayerByName(room, data.to);
    if (toPlayer === null) {
        await apigwManagementApi.postToConnection({ ConnectionId: fromConnectionId, Data: JSON.stringify({ type: 'error', data: 'No destination found!' }) }).promise();
        return;
    }

    await apigwManagementApi.postToConnection({ ConnectionId: toPlayer.connectionId.S, Data: signalResponse(data, fromPlayer) }).promise();
}

exports.handler = async (event, context) => {

    const messageHandlers = {
        create: messageCreate,
        join: messageJoin,
        signal: messageSignal
    }

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName
    });

    const payload = JSON.parse(JSON.parse(event.body).data);
    const connectionId = event.requestContext.connectionId;

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
