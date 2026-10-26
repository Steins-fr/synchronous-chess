import { Browser, BrowserContext, Dialog, expect, Locator, Page, Request, WebSocket } from '@playwright/test';

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
    // The websocket API run locally (environment.local.ts): the dev server of the app opens a socket of its own, to
    // reload the page
    private static readonly API_SOCKET: string = 'ws://127.0.0.1:3001';
    // The HTTP API run locally (environment.local.ts)
    private static readonly API_SERVER: string = 'http://127.0.0.1:3001';

    /** The URLs of the sockets the page opened to the API */
    private readonly apiSockets: string[] = [];
    /** The URLs of the requests the page sent to the HTTP API */
    private readonly apiRequests: string[] = [];
    /** The times the browser asked to confirm the unload of the page: a match left */
    private unloadPrompts: number = 0;

    private constructor(
        public readonly name: string,
        private readonly context: BrowserContext,
        public readonly page: Page,
        private readonly path: string,
    ) {
        page.on('websocket', (webSocket: WebSocket) => {
            if (webSocket.url().startsWith(RoomParticipant.API_SOCKET)) {
                this.apiSockets.push(webSocket.url());
            }
        });
        page.on('request', (request: Request) => {
            if (request.url().startsWith(RoomParticipant.API_SERVER)) {
                this.apiRequests.push(request.url());
            }
        });
        // The player confirms leaving its match: a reload, a close, a link out of the app
        page.on('dialog', (dialog: Dialog) => {
            if (dialog.type() === 'beforeunload') {
                this.unloadPrompts++;
            }
            void dialog.accept();
        });
    }

    /**
     * @param path the page of the game of the room
     * @param locale the language of the browser: the one of the config (en-US) by default
     */
    public static async open(browser: Browser, name: string, path: string, locale?: string): Promise<RoomParticipant> {
        const context: BrowserContext = await browser.newContext(locale === undefined ? {} : { locale });
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

        return new RoomParticipant(name, context, await context.newPage(), path);
    }

    /** Another tab of the browser of the player, under another name: its session storage apart */
    public async newTab(name: string): Promise<RoomParticipant> {
        return new RoomParticipant(name, this.context, await this.context.newPage(), this.path);
    }

    /** The tab duplicated, opened at the same URL with a copy of its session storage, under another name */
    public async duplicateTab(name: string): Promise<RoomParticipant> {
        const [copy]: [Page, void] = await Promise.all([
            this.context.waitForEvent('page'),
            this.page.evaluate(() => {
                window.open(window.location.href);
            }),
        ]);
        await copy.waitForLoadState('networkidle');
        await copy.mouse.move(100, 100);
        return new RoomParticipant(name, this.context, copy, this.path);
    }

    /**
     * Creates the room, private with a password
     * @returns the id of the room: its name and the tag the API drew, read from the answer of the API
     */
    public async create(roomName: string, password?: string): Promise<string> {
        await this.page.goto(this.path);
        // Opened by the creation: the page reaches the API once a person acts on it
        const socket: Promise<WebSocket> = this.page.waitForEvent('websocket', {
            predicate: (webSocket: WebSocket) => webSocket.url().startsWith(RoomParticipant.API_SOCKET),
            timeout: RoomParticipant.LISTING_TIMEOUT,
        });
        await this.page.getByRole('button', { name: 'Create a room', exact: true }).click();
        const dialog: Locator = this.page.locator('app-room-create-dialog');
        await dialog.getByRole('textbox', { name: 'Room name' }).fill(roomName);
        await dialog.getByRole('textbox', { name: 'Player name' }).fill(this.name);
        if (password !== undefined) {
            await dialog.getByLabel('Password (private room)').fill(password);
        }
        await dialog.getByRole('button', { name: 'Create', exact: true }).click();

        // The answer of the API: the room created, or the creation refused, failing at once with its message
        const answer: { payload: string | Buffer } = await (await socket).waitForEvent('framereceived', {
            predicate: ({ payload }: { payload: string | Buffer }) => ['created', 'error'].includes(RoomParticipant.packet(payload).type ?? ''),
            timeout: RoomParticipant.LISTING_TIMEOUT,
        });
        const { type, data } = RoomParticipant.packet(answer.payload);
        if (type === 'error') {
            throw new Error(`The creation of the room ${ roomName } was refused: ${ data.message }`);
        }

        return data.roomName;
    }

    /** A packet the API sent the page */
    private static packet(payload: string | Buffer): { type?: string; data: { roomName: string; message?: string } } {
        return JSON.parse(payload.toString()) as { type?: string; data: { roomName: string; message?: string } };
    }

    /**
     * Loads the page of the room without acting on it, as a bot rendering it, until it settles: a script Playwright
     * runs in the page (a snapshot of a trace, an evaluation) carries a user gesture, which would activate a page still
     * starting, as a person does
     * @param options.fakeClock its clock faked, the time flowing as usual until passTime(); its performance entries are
     * faked too, none telling a reload
     */
    public async load(options?: { fakeClock?: boolean }): Promise<void> {
        if (options?.fakeClock === true) {
            await this.page.clock.install();
        }
        await this.page.goto(this.path, { waitUntil: 'networkidle' });
    }

    /**
     * Passes the time of a page loaded with a fake clock at once, its timers run: the requests they send reach the API in
     * the second after
     */
    public async passTime(time: number): Promise<void> {
        await this.page.clock.fastForward(time);
        await this.page.waitForTimeout(1000);
    }

    /**
     * Opens the page of the room as a person, the pointer moving over it once it settles, the app listening: its list
     * of the open rooms
     * @param url another URL of the app, a link received: the URL of a room
     */
    public async visit(url: string = this.path): Promise<void> {
        await this.page.goto(url, { waitUntil: 'networkidle' });
        await this.page.mouse.move(100, 100);
    }

    /** Joins a room of the list of the open rooms, giving the password of a private one */
    public async join(roomName: string, password?: string): Promise<void> {
        await this.visit();
        await this.joinListedRoom(roomName, password);
    }

    /**
     * Reloads the page, which joins its room again by itself, under the name and with the token its tab kept: the browser
     * asks to confirm leaving a match
     */
    public async reload(): Promise<void> {
        await this.page.reload();
    }

    /** The URL of the page once it holds its room, the id of the room in it: a link to send */
    public async roomUrl(roomId: string): Promise<string> {
        await expect(this.page).toHaveURL((url: URL) => url.searchParams.get('room') === roomId);
        return this.page.url();
    }

    /** The page holds no room in its URL */
    public async expectNoRoomUrl(): Promise<void> {
        await expect(this.page).toHaveURL((url: URL) => !url.searchParams.has('room'));
    }

    /** The join dialog of a room opened, the name it gives */
    public async expectJoinDialog(roomId: string, playerName: string): Promise<void> {
        const dialog: Locator = this.page.locator('app-room-join-dialog');
        await expect(dialog).toContainText(roomId);
        await expect(dialog.getByRole('textbox', { name: 'Player name' })).toHaveValue(playerName);
    }

    /** Sends the join dialog open, under the name of the player, with the password of a private room */
    public async sendJoinDialog(password?: string): Promise<void> {
        const dialog: Locator = this.page.locator('app-room-join-dialog');
        await dialog.getByRole('textbox', { name: 'Player name' }).fill(this.name);
        if (password !== undefined) {
            await dialog.getByLabel('Password').fill(password);
        }
        await dialog.getByRole('button', { name: 'Join', exact: true }).click();
    }

    /** The times the browser asked to confirm the unload of the page, each one accepted */
    public expectUnloadPrompts(count: number): void {
        expect(this.unloadPrompts).toEqual(count);
    }

    /**
     * Joins a room of the list, once listed: the list is refreshed until then, a room is listed once created. A room
     * full or waiting for its host is listed too, its join retried by the page until it has a place or its host is back.
     * The dialog asks the name of the player, and the password of a private room
     */
    public async joinListedRoom(roomName: string, password?: string): Promise<void> {
        const joinButton: Locator = this.page.getByRole('button', { name: `Join the room ${ roomName }`, exact: true });
        await expect(async () => {
            await this.page.getByRole('button', { name: 'Refresh the rooms' }).click();
            await expect(joinButton).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: RoomParticipant.LISTING_TIMEOUT });
        await joinButton.click();
        await this.sendJoinDialog(password);
    }

    /** A room of the list of the open rooms, private or public */
    public async expectOpenRoom(roomName: string, isPrivate: boolean): Promise<void> {
        const row: Locator = this.page.locator('app-open-rooms li').filter({ hasText: roomName });
        await expect(row.getByRole('img', { name: isPrivate ? 'Private room' : 'Public room' })).toBeVisible();
    }

    /** The state of a room of the list, once refreshed: full, or its host reconnecting */
    public async expectRoomState(roomName: string, state: string): Promise<void> {
        const row: Locator = this.page.locator('app-open-rooms li').filter({ hasText: roomName });
        await expect(async () => {
            await this.page.getByRole('button', { name: 'Refresh the rooms' }).click();
            await expect(row).toContainText(state, { timeout: 2000 });
        }).toPass({ timeout: RoomParticipant.LISTING_TIMEOUT });
    }

    /** Searches the rooms by a part of their name */
    public async searchRooms(search: string): Promise<void> {
        await this.page.getByRole('textbox', { name: 'Search for a room' }).fill(search);
    }

    /** The names of the rooms listed */
    public async expectListedRooms(roomNames: ReadonlyArray<string>): Promise<void> {
        await expect(this.page.locator('app-open-rooms li .font-bold')).toHaveText([...roomNames]);
    }

    /** The page opened no socket to the API: the open rooms, searched or not, are listed by the HTTP API */
    public expectNoApiSocket(): void {
        expect(this.apiSockets).toEqual([]);
    }

    /** The page sent no request to the HTTP API, its database left asleep */
    public expectNoApiRequest(): void {
        expect(this.apiRequests).toEqual([]);
    }

    /** The page opened a socket to the API: once it created or joined a room */
    public async expectApiSocket(): Promise<void> {
        await expect.poll(() => this.apiSockets.length).toBeGreaterThan(0);
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
        await this.page.getByRole('textbox', { name: 'Type your message' }).fill(text);
        await this.page.getByRole('button', { name: 'Send' }).click();
    }

    public async expectMessage(from: string, text: string): Promise<void> {
        await expect(this.page.locator('#chat')).toContainText(`${ from }: ${ text }`);
    }

    /** A notification shown to the player, among the ones queued one after the other */
    public async expectNotification(text: string, timeout?: number): Promise<void> {
        await expect(this.page.locator('mat-snack-bar-container').getByText(text)).toBeVisible({ timeout });
    }

    /** The room setup is shown again: the player is in no room */
    public async expectSetupForm(timeout?: number): Promise<void> {
        await expect(this.page.getByRole('button', { name: 'Create a room', exact: true })).toBeVisible({ timeout });
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
