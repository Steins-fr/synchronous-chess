import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import {
    RoomSocketApiNotificationEnum,
    RoomSocketApiNotificationTypedData,
    SocketPacketNotificationPayload,
} from '@protocol/socket-packet-payload.type';

/** The command posting a notification to a websocket connection */
export function notificationCommand<Type extends RoomSocketApiNotificationEnum>(type: Type, to: string, data: RoomSocketApiNotificationTypedData[Type]): PostToConnectionCommand {
    const notification: SocketPacketNotificationPayload<Type> = {
        type,
        data,
    };

    return new PostToConnectionCommand({ ConnectionId: to, Data: JSON.stringify(notification) });
}
