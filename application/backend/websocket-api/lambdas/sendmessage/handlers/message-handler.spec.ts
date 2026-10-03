import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import BadRequestException from '@exceptions/bad-request-exception';
import {
    RoomApiRequestTypeEnum,
    RoomApiResponseTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomSocketApiRequestTypedData,
    SocketPacketRequestPayload,
} from '@protocol/socket-packet-payload.type';
import { anApiGatewayClient, aRequest, HOST_CONNECTION, postedPackets } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MessageHandler from './message-handler';

/** Exposes what the handlers inherit */
class TestHandler extends MessageHandler {
    public constructor(payload: SocketPacketRequestPayload, private readonly onHandle: (handler: TestHandler) => Promise<void>) {
        super(anApiGatewayClient(), HOST_CONNECTION, payload);
    }

    public data<Type extends RoomApiRequestTypeEnum>(type: Type): RoomSocketApiRequestTypedData[Type] {
        return this.getPayloadData(type);
    }

    public sendNotification(): Promise<object> {
        return this.notify(RoomSocketApiNotificationEnum.JOIN_REQUEST, 'guest-connection', { playerName: 'guest' });
    }

    public sendReply(): Promise<object> {
        return this.reply(RoomApiResponseTypeEnum.PLAYERS, { players: ['host'] });
    }

    protected override handle(): Promise<void> {
        return this.onHandle(this);
    }
}

describe('MessageHandler', () => {
    const apiGateway = mockClient(ApiGatewayManagementApiClient);
    const request: SocketPacketRequestPayload<RoomApiRequestTypeEnum.PLAYER_GET_ALL> = aRequest(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName: 'room' });

    beforeEach(() => {
        apiGateway.reset().onAnyCommand().resolves({});
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    test('should notify a connection and reply to the request', async () => {
        // Given
        const handler: TestHandler = new TestHandler(request, async (self: TestHandler) => {
            await self.sendNotification();
            await self.sendReply();
        });

        // When
        await handler.execute();

        // Then
        expect(postedPackets(apiGateway)).toEqual([
            { to: 'guest-connection', packet: { type: 'joinRequest', data: { playerName: 'guest' } } },
            { to: HOST_CONNECTION, packet: { id: 7, type: 'players', data: { players: ['host'] } } },
        ]);
    });

    test('should read the data of the request of its type', async () => {
        // Given
        let data: RoomSocketApiRequestTypedData[RoomApiRequestTypeEnum.PLAYER_GET_ALL] | undefined;
        const handler: TestHandler = new TestHandler(request, async (self: TestHandler) => {
            data = self.data(RoomApiRequestTypeEnum.PLAYER_GET_ALL);
        });

        // When
        await handler.execute();

        // Then
        expect(data).toEqual({ roomName: 'room' });
    });

    test.each([
        ['without data', { ...request, data: undefined } as unknown as SocketPacketRequestPayload, 'No data for the request'],
        ['of another type', request, 'Payload not valid'],
    ])('should reply an error to a request %s', async (_case: string, payload: SocketPacketRequestPayload, message: string) => {
        // Given
        const handler: TestHandler = new TestHandler(payload, async (self: TestHandler) => {
            self.data(RoomApiRequestTypeEnum.CREATE);
        });

        // When / Then
        await expect(handler.execute()).rejects.toThrow(message);
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { id: 7, type: 'error', data: { message } } }]);
    });

    test('should reply the message of a bad request', async () => {
        // Given
        const handler: TestHandler = new TestHandler(request, () => Promise.reject(new BadRequestException('Refused')));

        // When / Then
        await expect(handler.execute()).rejects.toThrow('Refused');
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { id: 7, type: 'error', data: { message: 'Refused' } } }]);
        expect(console.error).toHaveBeenCalled();
    });

    test.each([
        ['an error', new Error('Internal')],
        ['an object of another type', { type: 'dynamo_db' }],
        ['an object without type', { message: 'Internal' }],
        ['a string', 'Internal'],
        ['nothing', undefined],
    ])('should not reply the details of %s', async (_case: string, failure: unknown) => {
        // Given
        const handler: TestHandler = new TestHandler(request, () => Promise.reject(failure));

        // When / Then
        await expect(handler.execute()).rejects.toBe(failure);
        expect(postedPackets(apiGateway)).toEqual([]);
    });
});
