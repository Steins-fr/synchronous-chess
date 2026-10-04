import { test as base, Browser } from '@playwright/test';
import { RoomParticipant } from './room-participant';

/** A chat room of its own for a test, its players closed after it */
export class TestRoom {
    // The local API keeps the rooms between two runs
    public readonly name: string = `room-${ Date.now() }`;
    private readonly participants: RoomParticipant[] = [];

    public constructor(private readonly browser: Browser) {}

    private async open(playerName: string): Promise<RoomParticipant> {
        const participant: RoomParticipant = await RoomParticipant.open(this.browser, playerName);
        this.participants.push(participant);
        return participant;
    }

    /** The host creates the room, then the players join it one after the other, each connecting to the others */
    public async connect(hostName: string, ...playerNames: string[]): Promise<RoomParticipant[]> {
        const host: RoomParticipant = await this.open(hostName);
        await host.create(this.name);
        await host.expectParticipants([hostName]);
        const connected: RoomParticipant[] = [host];

        for (const playerName of playerNames) {
            // eslint-disable-next-line no-await-in-loop -- one player joining at a time
            connected.push(await this.join(playerName));
            const names: string[] = connected.map((participant: RoomParticipant) => participant.name);
            // eslint-disable-next-line no-await-in-loop -- connected before the next one joins
            await Promise.all(connected.map((participant: RoomParticipant) => participant.expectParticipants(names)));
        }

        return connected;
    }

    public async join(playerName: string): Promise<RoomParticipant> {
        const player: RoomParticipant = await this.open(playerName);
        await player.join(this.name);
        return player;
    }

    public async close(): Promise<void> {
        await Promise.all(this.participants.map((participant: RoomParticipant) => participant.close()));
    }
}

export const test = base.extend<{ room: TestRoom }>({
    room: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser);
        await use(room);
        await room.close();
    },
});
