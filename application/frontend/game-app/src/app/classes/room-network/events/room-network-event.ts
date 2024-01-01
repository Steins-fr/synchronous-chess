export enum RoomNetworkEventType {
    PLAYER_ADD = 'playerAdd',
    PLAYER_REMOVE = 'playerRemove',
    QUEUE_ADD = 'queueAdd',
    QUEUE_REMOVE = 'queueRemove',
}

export default abstract class RoomNetworkEvent {
    protected constructor(public readonly type: RoomNetworkEventType) { }
}
