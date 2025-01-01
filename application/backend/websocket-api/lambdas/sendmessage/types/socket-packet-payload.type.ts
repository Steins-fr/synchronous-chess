import FullNotification from '../notifications/full-notification';
import JoinNotification from '../notifications/join-notification';
import SignalNotification from '../notifications/signal-notification';
import FullRequest from '../requests/full-request';
import PlayerRequest from '../requests/player-request';
import PlayersRequest from '../requests/players-request';
import RoomCreateRequest from '../requests/room-create-request';
import RoomJoinRequest from '../requests/room-join-request';
import RtcSignalRequest from '../requests/rtc-signal-request';
import ErrorResponse from '../responses/error-response';
import FullResponse from '../responses/full-response';
import PlayerResponse from '../responses/player-response';
import PlayersResponse from '../responses/players-response';
import RoomCreateResponse from '../responses/room-create-response';
import RoomJoinResponse from '../responses/room-join-response';
import RtcSignalResponse from '../responses/rtc-signal-response';

export interface SocketPacketPayload<Type, Data> {
    id: number; // Positive number are reserved for followed messages, request and response share the same id, -1 is reserved for notifications
    type: Type;
    data: Data;
}

// region RequestPayload
export enum RoomApiRequestTypeEnum {
    CREATE = 'create',
    JOIN = 'join',
    PLAYER_GET_ALL = 'playerGetAll',
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove',
    FULL = 'full',
    SIGNAL = 'signal'
}

export type RoomSocketApiRequestTypedData = {
    'create': RoomCreateRequest,
    'join': RoomJoinRequest,
    'playerGetAll': PlayersRequest,
    'playerAdd': PlayerRequest,
    'playerRemove': PlayerRequest,
    'signal': RtcSignalRequest,
    'full': FullRequest,
};

export type SocketPacketRequestPayload<Type extends RoomApiRequestTypeEnum = RoomApiRequestTypeEnum> = SocketPacketPayload<Type, RoomSocketApiRequestTypedData[Type]>;
// endregion

// region ResponsePayload
export enum RoomApiResponseTypeEnum {
    ADDED = 'added',
    CREATED = 'created',
    ERROR = 'error',
    FULL_SENT = 'fullSent',
    JOINING_ROOM = 'joiningRoom',
    PLAYERS = 'players',
    REMOVED = 'removed',
    SIGNAL_SENT = 'signalSent',
}

export type RoomSocketApiResponseType = `${ RoomApiResponseTypeEnum }`;
export type RoomSocketApiResponseTypedData = {
    'added': PlayerResponse,
    'created': RoomCreateResponse,
    'error': ErrorResponse,
    'fullSent': FullResponse,
    'joiningRoom': RoomJoinResponse,
    'players': PlayersResponse,
    'removed': PlayerResponse,
    'signalSent': RtcSignalResponse,
};

export type SocketPacketResponsePayload<Type extends RoomApiResponseTypeEnum = RoomApiResponseTypeEnum> = SocketPacketPayload<Type, RoomSocketApiResponseTypedData[Type]>;
// endregion

// region NotificationPayload
export enum RoomSocketApiNotificationEnum {
    FULL = 'full',
    JOIN_REQUEST = 'joinRequest',
    REMOTE_SIGNAL = 'remoteSignal'
}

// Compared to Response, Notification ara propagated as RoomSocketApiNotifications.
// So, we need to ensure that comparing `type` to `RoomSocketApiNotificationEnum` determines `data` type.
export type RoomSocketApiNotificationType = `${ RoomSocketApiNotificationEnum }`;
export type RoomSocketApiNotificationTypedData = {
    'full': FullNotification,
    'joinRequest': JoinNotification,
    'remoteSignal': SignalNotification,
};

type RoomSocketApiNotification<Type extends RoomSocketApiNotificationType> = {
    type: Type,
    data: RoomSocketApiNotificationTypedData[Type],
};

export type SocketPacketNotificationPayload<Type extends RoomSocketApiNotificationType> = RoomSocketApiNotification<Type>;

// endregion

// Throw compilation error if colliding key in constants. Responsibility of this component because this is its behavior that defines that keys should not collide
type NotificationAndResponseCommonKeys = RoomSocketApiNotificationType & RoomSocketApiResponseType;
type NotificationAndResponseHasCommonKeys = NotificationAndResponseCommonKeys extends never ? 'NotificationAndResponseHasNoCommonKeys' : `Notifications cannot have same key than key registered in Responses, common key is -> ${NotificationAndResponseCommonKeys}`;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const notificationAndResponseHasCommonKeys: NotificationAndResponseHasCommonKeys = 'NotificationAndResponseHasNoCommonKeys';
