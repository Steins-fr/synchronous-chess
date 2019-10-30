export enum RoomEventType {
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove',
    QUEUE_ADD = 'queueAdd',
    QUEUE_REMOVE = 'queueRemove'
}

export default class RoomEvent {
    public constructor(public readonly type: RoomEventType) { }
}
