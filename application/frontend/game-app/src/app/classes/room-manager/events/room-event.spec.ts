import RoomPlayerRemoveEvent from './room-player-remove-event';
import RoomQueueAddEvent from './room-queue-add-event';
import RoomQueueRemoveEvent from './room-queue-remove-event';
import RoomReadyEvent from './room-ready-event';
import RoomPlayerAddEvent from './room-player-add-event';
import RoomEvent, { RoomEventType } from './room-event';

describe('RoomEvent', () => {

    it('should create an instance for each event type', () => {
        const event1: RoomEvent = new RoomPlayerAddEvent(undefined);
        const event2: RoomEvent = new RoomPlayerRemoveEvent(undefined);
        const event3: RoomEvent = new RoomQueueAddEvent(undefined);
        const event4: RoomEvent = new RoomQueueRemoveEvent(undefined);
        const event5: RoomEvent = new RoomReadyEvent(undefined);

        expect(event1).toBeTruthy();
        expect(event2).toBeTruthy();
        expect(event3).toBeTruthy();
        expect(event4).toBeTruthy();
        expect(event5).toBeTruthy();
        expect(event1.type).toEqual(RoomEventType.PLAYER_ADD);
        expect(event2.type).toEqual(RoomEventType.PLAYER_REMOVE);
        expect(event3.type).toEqual(RoomEventType.QUEUE_ADD);
        expect(event4.type).toEqual(RoomEventType.QUEUE_REMOVE);
        expect(event5.type).toEqual(RoomEventType.READY);
    });
});
