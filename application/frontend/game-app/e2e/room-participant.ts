import { Browser, BrowserContext, expect, Locator, Page } from '@playwright/test';

declare global {
    interface Window {
        /** The WebRTC connections the page opened, to cut them */
        peerConnections: RTCPeerConnection[];
    }
}

/** A player of the chat room, in a browser context of its own: as on its own computer */
export class RoomParticipant {
    // The list of a page refreshes every 15 seconds: refreshed on demand, a room is listed at once
    private static readonly LISTING_TIMEOUT: number = 30_000;

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
        await this.page.getByRole('button', { name: 'Créer une salle', exact: true }).click();
        const dialog: Locator = this.page.locator('app-room-create-dialog');
        await dialog.getByRole('textbox', { name: 'Nom de la salle' }).fill(roomName);
        await dialog.getByRole('textbox', { name: 'Nom du joueur' }).fill(this.name);
        if (password !== undefined) {
            await dialog.getByLabel('Mot de passe (salle privée)').fill(password);
        }
        await dialog.getByRole('button', { name: 'Créer', exact: true }).click();
    }

    /** Opens the page of the chat room, its list of the open rooms */
    public async visit(): Promise<void> {
        await this.page.goto('/simple-chat');
    }

    /** Joins a room of the list of the open rooms, giving the password of a private one */
    public async join(roomName: string, password?: string): Promise<void> {
        await this.visit();
        await this.joinListedRoom(roomName, password);
    }

    /** Reloads the page, then joins the room again from the list */
    public async reloadAndJoin(roomName: string): Promise<void> {
        await this.page.reload();
        await this.joinListedRoom(roomName);
    }

    /**
     * Joins a room of the list, once listed: the list is refreshed until then, a room is listed once created. A room
     * full or waiting for its host is listed too, its join retried by the page until it has a place or its host is back.
     * The dialog asks the name of the player, and the password of a private room
     */
    public async joinListedRoom(roomName: string, password?: string): Promise<void> {
        const joinButton: Locator = this.page.getByRole('button', { name: `Rejoindre la salle ${ roomName }`, exact: true });
        await expect(async () => {
            await this.page.getByRole('button', { name: 'Actualiser les salles' }).click();
            await expect(joinButton).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: RoomParticipant.LISTING_TIMEOUT });
        await joinButton.click();

        const dialog: Locator = this.page.locator('app-room-join-dialog');
        await dialog.getByRole('textbox', { name: 'Nom du joueur' }).fill(this.name);
        if (password !== undefined) {
            await dialog.getByLabel('Mot de passe').fill(password);
        }
        await dialog.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    }

    /** A room of the list of the open rooms, private or public */
    public async expectOpenRoom(roomName: string, isPrivate: boolean): Promise<void> {
        const row: Locator = this.page.locator('app-open-rooms li').filter({ hasText: roomName });
        await expect(row.getByRole('img', { name: isPrivate ? 'Salle privée' : 'Salle publique' })).toBeVisible();
    }

    /** The state of a room of the list, once refreshed: full, or its host reconnecting */
    public async expectRoomState(roomName: string, state: string): Promise<void> {
        const row: Locator = this.page.locator('app-open-rooms li').filter({ hasText: roomName });
        await expect(async () => {
            await this.page.getByRole('button', { name: 'Actualiser les salles' }).click();
            await expect(row).toContainText(state, { timeout: 2000 });
        }).toPass({ timeout: RoomParticipant.LISTING_TIMEOUT });
    }

    /** Searches the rooms by the start of their name */
    public async searchRooms(search: string): Promise<void> {
        await this.page.getByRole('textbox', { name: 'Rechercher une salle' }).fill(search);
    }

    /** The names of the rooms listed */
    public async expectListedRooms(roomNames: ReadonlyArray<string>): Promise<void> {
        await expect(this.page.locator('app-open-rooms li .font-bold')).toHaveText([...roomNames]);
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

    /** The room setup is shown again: the player is in no room */
    public async expectSetupForm(timeout?: number): Promise<void> {
        await expect(this.page.getByRole('button', { name: 'Créer une salle', exact: true })).toBeVisible({ timeout });
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
