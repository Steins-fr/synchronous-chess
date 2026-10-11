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

    /** Creates the room, private with a password */
    public async create(roomName: string, password?: string): Promise<void> {
        await this.page.goto('/simple-chat');
        if (password !== undefined) {
            await this.page.getByLabel('Mot de passe (salle privée)').fill(password);
        }
        await this.enter(roomName, 'Nouvelle');
    }

    public async join(roomName: string): Promise<void> {
        await this.page.goto('/simple-chat');
        await this.enter(roomName, 'Rejoindre');
    }

    /** Joins a room of the list of the open rooms, giving the password asked for a private one */
    public async joinFromList(roomName: string, password?: string): Promise<void> {
        await this.page.goto('/simple-chat');
        await this.page.getByRole('textbox', { name: 'Nom du joueur' }).fill(this.name);
        await this.joinListedRoom(roomName, password);
    }

    /** Joins a room of the list again, from the setup form */
    public async joinListedRoom(roomName: string, password?: string): Promise<void> {
        await this.page.getByRole('button', { name: `Rejoindre la salle ${ roomName }`, exact: true }).click();
        if (password !== undefined) {
            const dialog: Locator = this.page.locator('app-room-password-dialog');
            await dialog.getByLabel('Mot de passe').fill(password);
            await dialog.getByRole('button', { name: 'Rejoindre', exact: true }).click();
        }
    }

    /** The open rooms of the list, private or public */
    public async expectOpenRoom(roomName: string, isPrivate: boolean): Promise<void> {
        const row: Locator = this.page.locator('app-open-rooms li').filter({ hasText: roomName });
        await expect(row.getByRole('img', { name: isPrivate ? 'Salle privée' : 'Salle publique' })).toBeVisible();
    }

    /** Reloads the page, then joins the room again */
    public async reloadAndJoin(roomName: string): Promise<void> {
        await this.page.reload();
        await this.enter(roomName, 'Rejoindre');
    }

    private async enter(roomName: string, action: string): Promise<void> {
        await this.page.getByRole('textbox', { name: 'Nom de la salle' }).fill(roomName);
        await this.page.getByRole('textbox', { name: 'Nom du joueur' }).fill(this.name);
        // Not a button of the list of the open rooms: their names tell the room
        await this.page.getByRole('button', { name: action, exact: true }).click();
    }

    /** The participants this one is connected to, itself included, and the players joining */
    public async expectParticipants(names: ReadonlyArray<string>, timeout?: number): Promise<void> {
        await expect.poll(() => this.participantNames('#player-list mat-chip'), { timeout }).toEqual([...names].sort(RoomParticipant.byName));
    }

    /** The participants this one is connected to, itself included, none of them still joining */
    public async expectConnected(names: ReadonlyArray<string>, timeout?: number): Promise<void> {
        const sorted: string[] = [...names].sort(RoomParticipant.byName);
        await expect.poll(async () => ({
            participants: await this.participantNames('#player-list mat-chip'),
            connected: await this.participantNames('#player-list app-chat-participant mat-chip'),
        }), { timeout }).toEqual({ participants: sorted, connected: sorted });
    }

    private async participantNames(selector: string): Promise<string[]> {
        const chips: Locator = this.page.locator(selector);
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

    /** A notification shown to the player, among the ones queued one after the other */
    public async expectNotification(text: string, timeout?: number): Promise<void> {
        await expect(this.page.locator('mat-snack-bar-container').getByText(text)).toBeVisible({ timeout });
    }

    /** The room setup form is shown again: the player is in no room */
    public async expectSetupForm(timeout?: number): Promise<void> {
        await expect(this.page.getByRole('button', { name: 'Rejoindre', exact: true })).toBeVisible({ timeout });
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
