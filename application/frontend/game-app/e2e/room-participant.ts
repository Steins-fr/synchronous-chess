import { Browser, BrowserContext, expect, Locator, Page } from '@playwright/test';

declare global {
    interface Window {
        /** The WebRTC connections the page opened, to cut them */
        peerConnections: RTCPeerConnection[];
    }
}

/** A player of the chat room, in a browser context of its own: as on its own computer */
export class RoomParticipant {
    private constructor(
        public readonly name: string,
        private readonly context: BrowserContext,
        public readonly page: Page,
    ) {}

    public static async open(browser: Browser, name: string): Promise<RoomParticipant> {
        const context: BrowserContext = await browser.newContext();
        await context.addInitScript(() => {
            const NativePeerConnection: typeof RTCPeerConnection = window.RTCPeerConnection;
            window.peerConnections = [];
            window.RTCPeerConnection = class extends NativePeerConnection {
                public constructor(configuration?: RTCConfiguration) {
                    super(configuration);
                    window.peerConnections.push(this);
                }
            };
        });

        return new RoomParticipant(name, context, await context.newPage());
    }

    public async create(roomName: string): Promise<void> {
        await this.page.goto('/simple-chat');
        await this.enter(roomName, 'Nouvelle');
    }

    public async join(roomName: string): Promise<void> {
        await this.page.goto('/simple-chat');
        await this.enter(roomName, 'Rejoindre');
    }

    /** Reloads the page, then joins the room again */
    public async reloadAndJoin(roomName: string): Promise<void> {
        await this.page.reload();
        await this.enter(roomName, 'Rejoindre');
    }

    private async enter(roomName: string, action: string): Promise<void> {
        await this.page.getByRole('textbox', { name: 'Nom de la salle' }).fill(roomName);
        await this.page.getByRole('textbox', { name: 'Nom du joueur' }).fill(this.name);
        await this.page.getByRole('button', { name: action }).click();
    }

    /** The participants this one is connected to, itself included, and the players joining */
    public async expectParticipants(names: ReadonlyArray<string>, timeout?: number): Promise<void> {
        await expect.poll(() => this.participantNames(), { timeout }).toEqual([...names].sort(RoomParticipant.byName));
    }

    private async participantNames(): Promise<string[]> {
        const chips: Locator = this.page.locator('#player-list mat-chip');
        return (await chips.allInnerTexts()).map((text: string) => text.split(' - ')[0].trim()).sort(RoomParticipant.byName);
    }

    private static byName(a: string, b: string): number {
        return a.localeCompare(b);
    }

    public async sendMessage(text: string): Promise<void> {
        await this.page.getByRole('textbox', { name: 'Tape ton message' }).fill(text);
        await this.page.getByRole('button', { name: 'Envoyer' }).click();
    }

    public async expectMessage(from: string, text: string): Promise<void> {
        await expect(this.page.locator('#chat')).toContainText(`${ from } : ${ text }`);
    }

    /**
     * Closes the WebRTC connections of the page, as a network failure would: all of them, or the one opened at the
     * index given (in their opening order)
     */
    public async cutConnections(index?: number): Promise<void> {
        await this.page.evaluate((at: number | undefined) => {
            const connections: RTCPeerConnection[] = at === undefined ? window.peerConnections : [window.peerConnections[at]];
            connections.forEach((connection: RTCPeerConnection) => connection.close());
        }, index);
    }

    /** Leaves the room, closing the browser of the player */
    public async close(): Promise<void> {
        await this.context.close();
    }
}
