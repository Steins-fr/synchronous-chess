import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ConditionalCheckFailedException, DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { hashHostToken } from '@helpers/host-token.helper';
import Room from '@models/room';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiRequestTypedData,
    SocketPacketRequestPayload,
} from '@protocol/socket-packet-payload.type';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { beforeEach, vi } from 'vitest';

/** A packet the API posted to a websocket connection */
export interface PostedPacket {
    to: string | undefined;
    packet: unknown;
}

export interface AwsMocks {
    dynamo: AwsClientStub<DynamoDBDocumentClient>;
    apiGateway: AwsClientStub<ApiGatewayManagementApiClient>;
}

export const HOST_CONNECTION: string = 'host-connection';
export const GUEST_CONNECTION: string = 'guest-connection';
/** The token the host of `aRoom()` got at its creation */
export const HOST_TOKEN: string = 'host-token';

/** A room hosted by `host`, `guest` waiting in its queue */
export function aRoom(room: Partial<Room> = {}): Room {
    return {
        id: 'room',
        connectionId: HOST_CONNECTION,
        hostPlayer: 'host',
        maxPlayer: 2,
        players: [{ playerName: 'host' }],
        queue: [{ playerName: 'guest', connectionId: GUEST_CONNECTION }],
        hostTokenHash: hashHostToken(HOST_TOKEN),
        ...room,
    };
}

export function aRequest<Type extends RoomApiRequestTypeEnum>(type: Type, data: RoomSocketApiRequestTypedData[Type]): SocketPacketRequestPayload<Type> {
    return { id: 7, type, data };
}

/** The event of a websocket route, with only what the lambdas read */
export function anEvent(connectionId: string | undefined, body: string | null = null): APIGatewayProxyEvent {
    return { body, requestContext: { connectionId, domainName: 'api.test' } } as unknown as APIGatewayProxyEvent;
}

export function aDynamoError(): DynamoDBServiceException {
    return new DynamoDBServiceException({ name: 'InternalServerError', $fault: 'server', $metadata: {}, message: 'DynamoDB failed' });
}

/** What DynamoDB throws when the condition of a write does not hold */
export function aConditionFailure(): ConditionalCheckFailedException {
    return new ConditionalCheckFailedException({ $metadata: {}, message: 'The conditional request failed' });
}

export function anApiGatewayClient(): ApiGatewayManagementApiClient {
    return new ApiGatewayManagementApiClient({ endpoint: 'https://api.test', region: 'eu-west-3' });
}

/** The packets posted to the connections, in their order */
export function postedPackets(apiGateway: AwsClientStub<ApiGatewayManagementApiClient>): PostedPacket[] {
    return apiGateway.commandCalls(PostToConnectionCommand).map(({ args: [command] }: { args: [PostToConnectionCommand] }): PostedPacket => ({
        to: command.input.ConnectionId,
        packet: JSON.parse(command.input.Data as string),
    }));
}

/** Mocks DynamoDB and API Gateway in a describe block: reset before each test, they answer every command with an empty object */
export function mockAws(): AwsMocks {
    const mocks: AwsMocks = { dynamo: mockClient(DynamoDBDocumentClient), apiGateway: mockClient(ApiGatewayManagementApiClient) };

    beforeEach((): void => {
        mocks.dynamo.reset().onAnyCommand().resolves({});
        mocks.apiGateway.reset().onAnyCommand().resolves({});
        // The handlers log their failures
        vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    });

    return mocks;
}

/** The room DynamoDB finds by its name */
export function storeRoom(dynamo: AwsClientStub<DynamoDBDocumentClient>, room: Room): void {
    dynamo.on(GetCommand, { TableName: 'rooms', Key: { id: room.id } }).resolves({ Item: room });
}

/** The error a request gets in reply */
export function errorReply(message: string, to: string = HOST_CONNECTION): PostedPacket {
    return { to, packet: { id: 7, type: 'error', data: { message } } };
}
