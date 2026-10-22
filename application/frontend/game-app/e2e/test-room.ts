import { test as base, Browser, TestDetails } from '@playwright/test';
import { RoomParticipant } from './room-participant';

/** A room of its own for a test, a chat room by default, its players closed after it */
export class TestRoom {
    private readonly participants: RoomParticipant[] = [];

    /**
     * @param path the page of the game of the room
     * @param name the name of the room: the local API keeps the rooms between two runs
     */
    public constructor(
        private readonly browser: Browser,
        private readonly path: string = '/simple-chat',
        public readonly name: string = `room-${ Date.now() }`,
    ) {}

    private async open(playerName: string, locale?: string): Promise<RoomParticipant> {
        const participant: RoomParticipant = await RoomParticipant.open(this.browser, playerName, this.path, locale);
        this.participants.push(participant);
        return participant;
    }

    /** The host creates the room, then the players join it one after the other, each connecting to the others */
    public async connect(hostName: string, ...playerNames: string[]): Promise<RoomParticipant[]> {
        const host: RoomParticipant = await this.create(hostName);
        await host.expectParticipants([hostName]);
        const connected: RoomParticipant[] = [host];

        for (const playerName of playerNames) {
            // eslint-disable-next-line no-await-in-loop -- one player joining at a time
            connected.push(await this.join(playerName));
            const names: string[] = connected.map((participant: RoomParticipant) => participant.name);
            // eslint-disable-next-line no-await-in-loop -- connected before the next one joins
            await Promise.all(connected.map((participant: RoomParticipant) => participant.expectConnected(names)));
        }

        return connected;
    }

    /** Creates the room under the name of the test, whether another player created it already or not */
    public async create(playerName: string, password?: string): Promise<RoomParticipant> {
        const player: RoomParticipant = await this.open(playerName);
        await player.create(this.name, password);
        return player;
    }

    /** Joins the room from the list of the open rooms, with the password of a private one */
    public async join(playerName: string, password?: string): Promise<RoomParticipant> {
        const player: RoomParticipant = await this.open(playerName);
        await player.join(this.name, password);
        return player;
    }

    /** A bot loading the page, acting on nothing: its clock faked, for passTime() */
    public async load(playerName: string, options?: { fakeClock?: boolean }): Promise<RoomParticipant> {
        const player: RoomParticipant = await this.open(playerName);
        await player.load(options);
        return player;
    }

    /**
     * A player opening the page, the list of the open rooms
     * @param locale the language of its browser: the one of the config (en-US) by default
     */
    public async visit(playerName: string, locale?: string): Promise<RoomParticipant> {
        const player: RoomParticipant = await this.open(playerName, locale);
        await player.visit();
        return player;
    }

    public async close(): Promise<void> {
        await Promise.all(this.participants.map((participant: RoomParticipant) => participant.close()));
    }
}

/**
 * A scenario waiting for a delay of the room, which lasts it 20 seconds or more: the joins the API refuses for 20
 * seconds, the 15 seconds a negotiation takes to time out, or the room handed over. `npm run e2e:fast` runs the others
 */
export const SLOW: TestDetails = { tag: '@slow' };

export const test = base.extend<{ room: TestRoom }>({
    room: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser);
        await use(room);
        await room.close();
    },
});
