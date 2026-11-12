import { expect, Locator } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { SLOW, test as roomTest, TestRoom } from './test-room';

/** A room of the Fixed Roulette of its own for a test */
const test = roomTest.extend<{ fixedRoulette: TestRoom }>({
    fixedRoulette: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/fixed-roulette');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-fixed-table');
const status = (participant: RoomParticipant): Locator => table(participant).getByRole('status');
/** The seat of a player, on the page of a participant */
const seatOf = (participant: RoomParticipant, player: RoomParticipant): Locator => table(participant).locator('app-fixed-seat', { hasText: player.name });
/** The wheel of the page of a participant: its pockets hold the fields of the local player, the forms under the table their buttons */
const wheel = (participant: RoomParticipant): Locator => table(participant).locator('app-fixed-wheel');

/** What stays in place on the page of the Fixed Roulette while the match is played: the status, the cloth, the seat below, the actions */
const STEADY: ReadonlyArray<string> = ['app-fixed-table output', '#cloth', '#seat-bottom', '#actions'];

/** The chips bet on each pocket, pocket 1 first */
type Bets = readonly [number, number, number, number];

/** The players of a match, in the order they sat, and the spectator hosting the room: it orders the chain */
interface Match {
    readonly players: readonly [RoomParticipant, RoomParticipant];
    readonly spectator: RoomParticipant;
}

/** The roles of a game, drawn for the first one, then swapped: read from the page of the spectator */
interface Roles {
    readonly croupier: RoomParticipant;
    readonly punter: RoomParticipant;
}

/** What the players of a game play: the pocket of the ball and the bets of the croupier, then the bets of the punter */
interface GameMoves {
    readonly ball: number;
    readonly croupier: Bets;
    readonly punter: Bets;
}

/** The spectator hosts the room, the players sit one after the other, each on the seat at the bottom of its table */
async function seated(room: TestRoom, players: readonly [string, string], spectator: string): Promise<Match> {
    const [watching, first, second]: RoomParticipant[] = await room.connect(spectator, ...players);
    for (const player of [first, second]) {
        // eslint-disable-next-line no-await-in-loop -- the seats one after the other
        await table(player).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
        // eslint-disable-next-line no-await-in-loop -- seated before the next one sits
        await expect(seatOf(watching, player)).toBeVisible();
    }
    return { players: [first, second], spectator: watching };
}

/** The first player starts the match with the time picked: the players draw the first croupier, which places the ball */
async function started(room: TestRoom, players: readonly [string, string], spectator: string, time?: string): Promise<Match> {
    const match: Match = await seated(room, players, spectator);
    const starter: RoomParticipant = match.players[0];
    await expect(status(starter)).toHaveText('Pick the time of the bets, then start the match.');
    if (time !== undefined) {
        await table(starter).getByRole('radio', { name: time, exact: true }).click();
    }
    await table(starter).getByRole('button', { name: 'Start the match', exact: true }).click();
    await expect(status(match.spectator)).toHaveText(/ places the ball and bets…$/);
    await match.spectator.openHistory();
    return match;
}

/**
 * The pages ask for no motion: the ball revealed shows in its pocket at once, rather than rolling there for 2.5 seconds
 * each game
 */
async function still(match: Match): Promise<void> {
    await Promise.all([...match.players, match.spectator].map((participant: RoomParticipant) => participant.page.emulateMedia({ reducedMotion: 'reduce' })));
}

/** The roles of a game, read from the status of the spectator while the croupier places the ball */
async function rolesOf(match: Match, game: number): Promise<Roles> {
    await expect(table(match.spectator).locator('#game')).toHaveText(`Game ${ game } of 10`);
    await expect(status(match.spectator)).toHaveText(/ places the ball and bets…$/);
    const name: string = (await status(match.spectator).textContent() as string).replace('places the ball and bets…', '').trim();
    const [first, second] = match.players;
    return first.name === name ? { croupier: first, punter: second } : { croupier: second, punter: first };
}

/** Types the bets in the pockets of a wheel, an empty field betting no chip */
async function typed(form: Locator, bets: Bets, label: (pocket: number) => string = (pocket: number) => `Chips on ${ pocket }`): Promise<void> {
    for (const [index, chips] of bets.entries()) {
        if (chips > 0) {
            // eslint-disable-next-line no-await-in-loop -- the fields one after the other
            await form.getByRole('spinbutton', { name: label(index + 1), exact: true }).fill(`${ chips }`);
        }
    }
}

/** The croupier places the ball and bets: the punter bets next, on every page */
async function placed(match: Match, roles: Roles, ball: number, bets: Bets): Promise<void> {
    // The croupier clicks the place of the ball of its pocket, beside the rim
    await wheel(roles.croupier).getByRole('radio', { name: `${ ball }`, exact: true }).click();
    await typed(wheel(roles.croupier), bets);
    await table(roles.croupier).locator('#place-form').getByRole('button', { name: 'Place the ball and bet', exact: true }).click();
    await expect(status(match.spectator)).toHaveText(`${ roles.punter.name } bets…`);
}

/** The punter bets: the page of the croupier reveals the ball, the game over shows on the page of the spectator */
async function betOn(match: Match, roles: Roles, game: number, bets: Bets): Promise<void> {
    await typed(wheel(roles.punter), bets);
    await table(roles.punter).locator('#bet-form').getByRole('button', { name: 'Bet', exact: true }).click();
    await expect(table(match.spectator).locator('#last-game')).toHaveText(new RegExp(String.raw`^\s*Game ${ game }:`));
}

/** A game played: the roles read, the ball placed with the bets of the croupier, the bets of the punter, the ball revealed */
async function played(match: Match, game: number, moves: (roles: Roles) => Readonly<GameMoves>): Promise<Roles> {
    const roles: Roles = await rolesOf(match, game);
    const { ball, croupier, punter } = moves(roles);
    await placed(match, roles, ball, croupier);
    await betOn(match, roles, game, punter);
    return roles;
}

/** The labels of the pockets of the wheel of a participant, which tell the ball shown */
async function pocketLabels(participant: RoomParticipant): Promise<string[]> {
    return table(participant).locator('[id^="pocket-"]').evaluateAll((pockets: Element[]) => pockets.map((pocket: Element) => pocket.getAttribute('aria-label') ?? ''));
}

/** The page shows no ball: none on the disk, none in the texts of the wheel nor in the labels of its pockets */
async function expectNoBall(participant: RoomParticipant): Promise<void> {
    await expect(table(participant).locator('[data-ball]')).toHaveCount(0);
    await expect(table(participant).locator('app-fixed-wheel')).not.toContainText(/ball/i);
    for (const label of await pocketLabels(participant)) {
        expect(label, participant.name).not.toMatch(/ball/i);
    }
}

/** The elements of the table running out of the window, or their contents out of their boxes, sideways */
async function overflowing(participant: RoomParticipant): Promise<string[]> {
    return participant.page.evaluate(() => {
        const width: number = document.documentElement.clientWidth;
        const elements: Element[] = [...document.querySelectorAll('app-fixed-table, app-fixed-table *')];
        const out: string[] = elements
            .filter((element: Element) => {
                const box: DOMRect = element.getBoundingClientRect();
                // The notch of an outlined field holds its label floated: the label at rest runs over it by design
                const spilling: boolean = getComputedStyle(element).overflowX === 'visible' && element.closest('.mdc-notched-outline') === null
                    && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
                return box.width > 0 && (box.right > width + 1 || box.left < -1 || spilling);
            })
            .map((element: Element) => `${ element.tagName.toLowerCase() }${ element.id === '' ? '' : '#' + element.id }: ${ (element.textContent ?? '').trim().slice(0, 40) }`);
        return document.documentElement.scrollWidth > width ? ['the page', ...out] : out;
    });
}

test.describe('Fixed Roulette', () => {
    test('plays a match of 10 games to its end, watched by a spectator, then a new one', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const [alice, bob] = match.players;
        const carol: RoomParticipant = match.spectator;
        await still(match);
        await expect(table(carol).locator('#terms')).toHaveText('Bets of 1 min');
        await expect(seatOf(carol, alice)).toContainText('500 chips');

        // Alice croupier wins the 10 chips of Bob each time; Bob croupier, both bet on the ball: no chip moves
        for (let game = 1; game <= 10; game++) {
            // eslint-disable-next-line no-await-in-loop -- the games one after the other
            const roles: Roles = await played(match, game, ({ croupier }: Roles): GameMoves => croupier === alice
                ? { ball: 1, croupier: [10, 0, 0, 0], punter: [0, 10, 0, 0] }
                : { ball: 1, croupier: [10, 0, 0, 0], punter: [20, 0, 0, 0] });
            // eslint-disable-next-line no-await-in-loop -- the games one after the other
            await expect(carol.historyLines().first()).toHaveText(roles.croupier === alice
                ? `Game ${ game }: ball in pocket 1, the croupier alone on it. alice (croupier) +10 chips, bob (punter) −10 chips`
                : `Game ${ game }: ball in pocket 1, both players on it. bob (croupier) 0 chips, alice (punter) 0 chips`);
        }

        await expect(status(carol)).toHaveText('The match is over.');
        await expect(table(carol).locator('#result')).toHaveText('alice wins, 550 chips to 450 chips');
        await expect(seatOf(carol, bob)).toContainText('450 chips');
        await expect(carol.historyLines()).toHaveCount(10);
        await alice.sendMessage('well played');
        await carol.expectMessage('alice', 'well played');

        // A new match, the players seated still; the conversation of the match over stays readable, closed
        await table(bob).getByRole('button', { name: 'Play again', exact: true }).click();
        await expect(status(alice)).toHaveText('Pick the time of the bets, then start the match.');
        await expect(carol.pastLines()).toHaveCount(1);
        await expect(carol.pastLines().first()).toHaveText('Match 1: alice wins, 550 chips to 450 chips');
        await carol.selectPrivate('alice and bob');
        await expect(carol.page.locator('#private-closed')).toHaveText('This conversation is closed: it can still be read');
    });

    test('settles the ball of the croupier alone, of the punter alone, of both players and of no one, the page keeping its place', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const carol: RoomParticipant = match.spectator;
        const everyone: RoomParticipant[] = [...match.players, carol];
        await still(match);
        await Promise.all(everyone.map((participant: RoomParticipant) => watchSteadiness(participant.page, STEADY)));

        // Both on the ball: they share the chips of the other pockets, 15 to 35
        const first: Roles = await rolesOf(match, 1);
        const [croupier, punter] = [first.croupier.name, first.punter.name];
        await expect(status(first.croupier)).toHaveText('Place the ball and bet: the ball stays sealed until the punter bet.');
        await placed(match, first, 2, [0, 15, 50, 0]);
        await expect(table(carol).locator('#pocket-3')).toHaveAccessibleName(`Pocket 3, ${ croupier }: 50 chips`);
        await expect(status(first.punter)).toHaveText(`Bet, reading the bets of ${ croupier }.`);
        await expect(table(first.punter).locator('#bet-form')).toContainText(`${ croupier } bets 65 chips: bet as many at least, on 2 pockets at most.`);
        await betOn(match, first, 1, [0, 35, 0, 30]);
        await expect(carol.historyLines().first())
            .toHaveText(`Game 1: ball in pocket 2, both players on it. ${ croupier } (croupier) −26 chips, ${ punter } (punter) +26 chips`);
        await expect(table(carol).locator('#pocket-2')).toHaveAccessibleName('Pocket 2, the last ball');
        await expect(table(carol).locator('app-fixed-wheel')).toContainText('Last ball: pocket 2');

        // The croupier alone on the ball, the roles swapped: it takes every chip of the other pockets
        await played(match, 2, (): GameMoves => ({ ball: 3, croupier: [0, 15, 50, 0], punter: [0, 35, 0, 30] }));
        await expect(carol.historyLines().first())
            .toHaveText(`Game 2: ball in pocket 3, the croupier alone on it. ${ punter } (croupier) +65 chips, ${ croupier } (punter) −65 chips`);

        // The punter alone on the ball
        await played(match, 3, (): GameMoves => ({ ball: 4, croupier: [0, 15, 50, 0], punter: [0, 35, 0, 30] }));
        await expect(carol.historyLines().first())
            .toHaveText(`Game 3: ball in pocket 4, the punter alone on it. ${ croupier } (croupier) −65 chips, ${ punter } (punter) +65 chips`);

        // No one on the ball: the bank takes every chip bet
        await played(match, 4, (): GameMoves => ({ ball: 1, croupier: [0, 15, 50, 0], punter: [0, 35, 0, 30] }));
        await expect(carol.historyLines().first())
            .toHaveText(`Game 4: ball in pocket 1, no one on it. ${ punter } (croupier) −65 chips, ${ croupier } (punter) −65 chips`);
        await expect(table(carol).locator('#bank')).toHaveText('Bank: 130 chips');

        // Both on the ball, the shares rounded down: the chip left over goes to the punter
        await played(match, 5, (): GameMoves => ({ ball: 1, croupier: [10, 5, 0, 0], punter: [20, 0, 0, 0] }));
        await expect(carol.historyLines().first())
            .toHaveText(`Game 5: ball in pocket 1, both players on it. ${ croupier } (croupier) −4 chips, ${ punter } (punter) +4 chips`);

        await expect(table(carol).locator('#game')).toHaveText('Game 6 of 10');
        await expect(seatOf(carol, first.croupier)).toContainText('275 chips');
        await expect(seatOf(carol, first.punter)).toContainText('595 chips');
        for (const participant of everyone) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('rolls the ball revealed from the hub to its pocket, the table keeping the game until it is there, the page keeping its place', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const carol: RoomParticipant = match.spectator;
        const everyone: RoomParticipant[] = [...match.players, carol];
        const roles: Roles = await rolesOf(match, 1);
        await Promise.all(everyone.map((participant: RoomParticipant) => watchSteadiness(participant.page, STEADY)));

        // The croupier sees where its ball would lie under its pointer, then on the pocket it clicks
        const pockets: Locator = wheel(roles.croupier).getByRole('radiogroup', { name: 'Pocket of the ball' });
        await expect(wheel(roles.croupier).locator('[data-ghost]')).toHaveCount(0);
        await pockets.getByRole('radio', { name: '4', exact: true }).hover();
        await expect(wheel(roles.croupier).locator('[data-ghost="4"]')).toBeVisible();
        await pockets.getByRole('radio', { name: '2', exact: true }).click();
        await expect(pockets.getByRole('radio', { name: '2', exact: true })).toBeChecked();
        await expect(wheel(roles.croupier).locator('[data-ghost="2"]')).toBeVisible();
        await placed(match, roles, 2, [0, 15, 50, 0]);
        await expect(wheel(roles.croupier).getByRole('radio')).toHaveCount(0);
        await expect(wheel(roles.croupier).getByRole('spinbutton')).toHaveCount(0);

        // The punter bets: the ball rolls on every page, the game settled kept until it reached its pocket
        await typed(wheel(roles.punter), [0, 35, 0, 30]);
        await table(roles.punter).locator('#bet-form').getByRole('button', { name: 'Bet', exact: true }).click();
        for (const participant of everyone) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn, within the roll of the ball
            await expect(wheel(participant).locator('.rolling [data-ball="last"]')).toBeVisible();
            // eslint-disable-next-line no-await-in-loop -- each page in turn, within the roll of the ball
            await expect(table(participant).locator('#last-game')).toBeEmpty();
            // eslint-disable-next-line no-await-in-loop -- each page in turn, within the roll of the ball
            await expect(table(participant).locator('#game')).toHaveText('Game 1 of 10');
        }
        await expect(seatOf(carol, roles.croupier)).toContainText('435 chips');

        // The ball in its pocket: the chips settled, the gain of each player on its seat, the next game
        for (const participant of everyone) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await expect(table(participant).locator('#last-game')).toHaveText(/^\s*Game 1: ball in pocket 2, both players on it\./);
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await expect(wheel(participant).locator('.rolling')).toHaveCount(0);
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await expect(table(participant).locator('#pocket-2')).toContainClass('pocket-hit');
        }
        await expect(table(carol).locator('#pocket-2')).toHaveAccessibleName('Pocket 2, the last ball');
        await expect(seatOf(carol, roles.croupier)).toContainText('474 chips');
        await expect(seatOf(carol, roles.croupier)).toContainText('−26');
        await expect(seatOf(carol, roles.punter)).toContainText('+26');
        await expect(table(carol).locator('#game')).toHaveText('Game 2 of 10');
        for (const participant of everyone) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('plays a game on a phone in German, nothing running out of the window', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const carol: RoomParticipant = match.spectator;
        const everyone: RoomParticipant[] = [...match.players, carol];
        const roles: Roles = await rolesOf(match, 1);
        for (const participant of everyone) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await participant.page.locator('#language-button').click();
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await participant.page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await expect(participant.page.locator('html')).toHaveAttribute('lang', 'de');
        }
        await Promise.all(everyone.map((participant: RoomParticipant) => participant.narrow(360, 740)));
        const expectInWindow = async (): Promise<void> => {
            for (const participant of everyone) {
                // eslint-disable-next-line no-await-in-loop -- each page in turn
                expect(await overflowing(participant), participant.name).toEqual([]);
            }
        };

        // The croupier places the ball and bets, its form in the window
        await expect(status(roles.croupier)).toHaveText('Lege die Kugel und setze: Die Kugel bleibt versiegelt, bis der Pointeur gesetzt hat.');
        await expectInWindow();
        const placeForm: Locator = table(roles.croupier).locator('#place-form');
        await wheel(roles.croupier).getByRole('radio', { name: '2', exact: true }).click();
        await typed(wheel(roles.croupier), [0, 15, 50, 0], (pocket: number) => `Chips auf ${ pocket }`);
        await placeForm.getByRole('button', { name: 'Kugel legen und setzen', exact: true }).click();
        await expect(status(carol)).toHaveText(`${ roles.punter.name } setzt…`);
        await expect(table(roles.croupier).locator('app-fixed-wheel')).toContainText('Deine Kugel, versiegelt: Fach 2');

        // The punter bets too little first: its form, its hint and its error in the window
        const betForm: Locator = table(roles.punter).locator('#bet-form');
        await typed(wheel(roles.punter), [0, 35, 0, 0], (pocket: number) => `Chips auf ${ pocket }`);
        await betForm.getByRole('button', { name: 'Setzen', exact: true }).click();
        await expect(betForm).toContainText(`Setze mindestens 65 Chips, so viel wie ${ roles.croupier.name }`);
        await expectInWindow();
        await typed(wheel(roles.punter), [0, 35, 0, 30], (pocket: number) => `Chips auf ${ pocket }`);
        await betForm.getByRole('button', { name: 'Setzen', exact: true }).click();

        // The game over, told on 3 lines at most
        await expect(table(carol).locator('#last-game'))
            .toHaveText(`Durchgang 1: Kugel in Fach 2, beide Spieler darauf. ${ roles.croupier.name } (Croupier) −26 Chips, ${ roles.punter.name } (Pointeur) +26 Chips`);
        await expect(table(carol).locator('#game')).toHaveText('Durchgang 2 von 10');
        await expectInWindow();
    });

    test('ends the match at once on a player out of chips, then on a draw of two players all in off the ball', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const carol: RoomParticipant = match.spectator;

        // The punter bets all its chips off the ball: out of chips, it loses after the first game
        const first: Roles = await played(match, 1, (): GameMoves => ({ ball: 1, croupier: [500, 0, 0, 0], punter: [0, 500, 0, 0] }));
        const lost: string = `${ first.croupier.name } wins: ${ first.punter.name } has no chip left`;
        await expect(status(carol)).toHaveText('The match is over.');
        await expect(table(carol).locator('#result')).toHaveText(lost);
        await expect(table(carol).locator('#game')).toHaveText('Game 1 of 10');
        await expect(carol.historyLines().first())
            .toHaveText(`Game 1: ball in pocket 1, the croupier alone on it. ${ first.croupier.name } (croupier) +500 chips, ${ first.punter.name } (punter) −500 chips`);
        await expect(seatOf(carol, first.punter)).toContainText(/(?<![\d,])0 chips/);
        await expect(seatOf(carol, first.croupier)).toContainText('1,000 chips');

        // A new match: both players all in off the ball, the bank takes every chip, a draw
        await table(first.punter).getByRole('button', { name: 'Play again', exact: true }).click();
        await table(first.punter).getByRole('button', { name: 'Start the match', exact: true }).click();
        const second: Roles = await played(match, 1, (): GameMoves => ({ ball: 3, croupier: [500, 0, 0, 0], punter: [0, 500, 0, 0] }));
        await expect(status(carol)).toHaveText('The match is over.');
        await expect(table(carol).locator('#result')).toHaveText('A draw, 0 chips each');
        await expect(table(carol).locator('#bank')).toHaveText('Bank: 1,000 chips');
        await expect(carol.historyLines().first())
            .toHaveText(`Game 1: ball in pocket 3, no one on it. ${ second.croupier.name } (croupier) −500 chips, ${ second.punter.name } (punter) −500 chips`);
        await expect(carol.pastLines()).toHaveText([`Match 1: ${ lost }`]);
    });

    test('keeps the ball sealed of a croupier reloading the page, named by no other page before its reveal', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const carol: RoomParticipant = match.spectator;
        const roles: Roles = await rolesOf(match, 1);
        await placed(match, roles, 3, [0, 0, 20, 0]);

        // The ball on the page of the croupier only
        const sealed = async (): Promise<void> => {
            await expect(table(roles.croupier).locator('app-fixed-wheel')).toContainText('Your ball, sealed: pocket 3');
            await expect(table(roles.croupier).locator('#pocket-3')).toHaveAccessibleName(`Pocket 3, your ball, sealed, ${ roles.croupier.name }: 20 chips`);
            await expect(table(roles.croupier).locator('[data-ball="sealed"]')).toHaveCount(1);
        };
        await sealed();
        await expectNoBall(roles.punter);
        await expectNoBall(carol);

        // The croupier reloads: its ball sealed still, on its page only
        await roles.croupier.reload();
        roles.croupier.expectUnloadPrompts(1);
        await expect(status(roles.croupier)).toHaveText(`${ roles.punter.name } bets…`);
        await sealed();
        await expectNoBall(roles.punter);
        await expectNoBall(carol);

        // Its page reveals the ball sealed before the reload
        await betOn(match, roles, 1, [20, 0, 0, 0]);
        await expect(carol.historyLines().first())
            .toHaveText(`Game 1: ball in pocket 3, the croupier alone on it. ${ roles.croupier.name } (croupier) +20 chips, ${ roles.punter.name } (punter) −20 chips`);
        await expect(table(roles.punter).locator('#pocket-3')).toHaveAccessibleName('Pocket 3, the last ball');
    });

    test('shows the conversation of the players to the whole room, the players writing in it, the host muting one of them', async ({ fixedRoulette }) => {
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const [alice, bob] = match.players;
        const carol: RoomParticipant = match.spectator;
        const title: string = 'alice and bob';

        // The players write, the spectator reads without composer
        await alice.sendOpenly(title, 'the ball is in pocket 3');
        await bob.selectPrivate(title);
        await expect(bob.privateTabs()).toHaveCount(1);
        await expect(bob.privateTabs()).toContainText(title);
        await expect(bob.privateLines()).toHaveText(['alice: the ball is in pocket 3']);
        await bob.sendOpenly(title, 'surely not');
        const told: ReadonlyArray<string> = ['alice: the ball is in pocket 3', 'bob: surely not'];
        await expect(alice.privateLines()).toHaveText([...told]);
        await carol.selectPrivate(title);
        await expect(carol.privateLines()).toHaveText([...told]);
        await expect(carol.page.locator('#private-read-only')).toHaveText('Only the players write here');
        await expect(carol.page.locator('#room-private').getByRole('textbox')).toHaveCount(0);

        // A spectator joining during the match reads the lines written before
        const dave: RoomParticipant = await fixedRoulette.join('dave');
        await dave.expectConnected(['alice', 'bob', 'carol', 'dave']);
        await dave.selectPrivate(title);
        await expect(dave.privateLines()).toHaveText([...told]);
        await expect(dave.page.locator('#private-read-only')).toBeVisible();

        // The host mutes Bob from the chat: his composer of the conversation waits
        await carol.page.locator('#room-chat-toggle').click();
        await carol.moderate('bob', 'Mute for 5 minutes');
        await expect(bob.chatNotices('carol muted you for 5 minutes')).toHaveCount(1);
        await bob.page.locator('#room-private').getByRole('textbox').fill('it is in pocket 1');
        await expect(bob.page.locator('#private-send')).toBeDisabled();
        await expect(bob.page.locator('#room-private').getByRole('textbox')).toHaveAccessibleDescription(/^You are muted until /);

        // A message of Bob sent around his composer shows nowhere
        await bob.transmitOpenlyAroundComposer(title, 'muted message');
        await alice.sendOpenly(title, 'anyone?');
        const after: ReadonlyArray<string> = [...told, 'alice: anyone?'];
        await carol.selectPrivate(title);
        for (const participant of [alice, bob, carol, dave]) {
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await expect(participant.privateLines()).toHaveText([...after]);
        }
    });

    test('ends the match on a punter not betting in time', SLOW, async ({ fixedRoulette }) => {
        test.setTimeout(120_000);
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol', '30 s');
        const carol: RoomParticipant = match.spectator;
        await expect(table(carol).locator('#terms')).toHaveText('Bets of 30 s');
        const roles: Roles = await rolesOf(match, 1);
        await placed(match, roles, 2, [0, 40, 0, 0]);

        // The punter does not bet: hurried, then out of time
        await expect(status(roles.punter)).toHaveText('Hurry: your time runs out!', { timeout: 40_000 });
        await expect(table(carol).locator('#result')).toHaveText(`${ roles.croupier.name } wins: ${ roles.punter.name } does not bet in time`, { timeout: 30_000 });
        await expect(carol.historyLines().first()).toHaveText(`Game 1: ${ roles.punter.name } does not bet in time and loses the match`);
        await expect(status(carol)).toHaveText('The match is over.');
        // The bets of the game back to their owner
        await expect(seatOf(carol, roles.croupier)).toContainText('500 chips');
    });

    test('ends the match on a croupier not revealing its ball, once its time and the time of a player away are over', SLOW, async ({ fixedRoulette }) => {
        test.setTimeout(120_000);
        const match: Match = await started(fixedRoulette, ['alice', 'bob'], 'carol');
        const carol: RoomParticipant = match.spectator;
        const roles: Roles = await rolesOf(match, 1);
        await placed(match, roles, 2, [0, 40, 0, 0]);

        // The croupier leaves with its ball sealed, then the punter bets
        await roles.croupier.close();
        await wheel(roles.punter).getByRole('spinbutton', { name: 'Chips on 1', exact: true }).fill('40');
        await table(roles.punter).locator('#bet-form').getByRole('button', { name: 'Bet', exact: true }).click();
        await expect(status(carol)).toHaveText(`Waiting for ${ roles.croupier.name } to come back…`);
        await expect(table(carol).locator('#result'))
            .toHaveText(`${ roles.punter.name } wins: ${ roles.croupier.name } does not reveal the ball in time`, { timeout: 60_000 });
        await expect(carol.historyLines().first()).toHaveText(`Game 1: ${ roles.croupier.name } does not reveal the ball in time and loses the match`);
        // The bets of the game back to their owners
        await expect(seatOf(carol, roles.punter)).toContainText('500 chips');
        await expect(seatOf(carol, roles.croupier)).toContainText('500 chips');
    });
});
