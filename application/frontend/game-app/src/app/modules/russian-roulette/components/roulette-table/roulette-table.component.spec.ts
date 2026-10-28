import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { By } from '@angular/platform-browser';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { ExponentialElGamal } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { TEST_GROUP } from '@testing/sra-test-group';
import { TestHelper } from '@testing/test.helper';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CylinderMessageType, CylinderSpinMessage } from '../../classes/cylinder/cylinder-messages';
import { RoulettePayloads, RRGameSessionType, RussianRouletteSession } from '../../classes/game-sessions/russian-roulette-session';
import { RouletteRules, RUSSIAN_ROULETTE_RULES } from '../../classes/rules/roulette-game';
import { RouletteSeat } from '../../classes/rules/roulette-seat';
import { REVOLVER_HOLD, RevolverFire, RouletteRevolverComponent } from '../roulette-revolver/roulette-revolver.component';
import { ROULETTE_SESSION_OPTIONS, RouletteTableComponent } from './roulette-table.component';

const cipher = new ExponentialElGamal(TEST_GROUP);
/** A short game: 6 chambers, a bullet each */
const SHORT: RouletteRules = { ...RUSSIAN_ROULETTE_RULES, chambers: 6, bullets: 1 };
/** The bullets of the manga in fewer chambers, for the specs to run fast */
const LIGHT: RouletteRules = { ...RUSSIAN_ROULETTE_RULES, chambers: 12 };

type Tamper = (message: AppMessage) => AppMessage;

/** A page discloses another key, refused: the game waits for its key */
const withheldKey: Tamper = (message: AppMessage) => message.type === CylinderMessageType.DISCLOSE ? { ...message, payload: { ...(message.payload as object), secret: '2' } } : message;

/** Bob turns the cylinder backwards: the check finds his spin cheated */
const reversedSpin: Tamper = (message: AppMessage) => message.type === CylinderMessageType.SPIN
    ? { ...message, payload: { ...(message.payload as CylinderSpinMessage), chambers: [...(message.payload as CylinderSpinMessage).chambers].reverse() } }
    : message;

/** Waits for a check: loading the bullets checks their proofs, slower when the specs run in parallel */
const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

// A game loads and spins its cylinder, its proofs checked: slower when the specs run in parallel
describe('RouletteTableComponent', { timeout: 30_000 }, () => {
    let hub: RoomHub<RoulettePayloads>;
    let fixture: ComponentFixture<RouletteTableComponent>;
    let sessions: RussianRouletteSession[];
    let rooms: Map<string, Room<RoulettePayloads>>;

    /** The table of the local participant */
    async function table(name: string, rules: RouletteRules = LIGHT, tamper?: Tamper): Promise<void> {
        // The revolver fires at once: the specs end its animations themselves
        // The warning before leaving a match is provided by the page
        TestBed.configureTestingModule({ providers: [{ provide: ROULETTE_SESSION_OPTIONS, useValue: { cipher, rules } }, { provide: REVOLVER_HOLD, useValue: 0 }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(RouletteTableComponent);
        const room: Room<RoulettePayloads> = hub.room(name, tamper);
        rooms.set(name, room);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
    }

    /** Another participant of the room */
    function participant(name: string, rules: RouletteRules = LIGHT, tamper?: Tamper): RussianRouletteSession {
        const room: Room<RoulettePayloads> = hub.room(name, tamper);
        const session = new RussianRouletteSession(room, { cipher, rules });
        rooms.set(name, room);
        sessions.push(session);
        return session;
    }

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const button = (label: string | RegExp): HTMLButtonElement | undefined => Array.from(element().querySelectorAll<HTMLButtonElement>(':scope > section > div > div > button'))
        .find((candidate: HTMLButtonElement) => typeof label === 'string' ? candidate.textContent?.trim() === label : label.test(candidate.textContent?.trim() ?? ''));
    const revolver = (): RouletteRevolverComponent => fixture.debugElement.query(By.directive(RouletteRevolverComponent)).componentInstance;
    const chamber = (index: number): HTMLButtonElement => element().querySelectorAll<HTMLButtonElement>('app-roulette-cylinder button')[index];
    /** The moves of the game, as the history of the room shows them: the latest first */
    const history = (): ReadonlyArray<string> => fixture.componentInstance.history().map(translated);
    /** The former games, as the history of the room shows them: the latest first */
    const pastGames = (): ReadonlyArray<string> => fixture.componentInstance.pastResults().map(pastLine);

    /** The animations of the table end, as the browser runs them: the shot of the revolver, the chips flying, the stamp of a pass */
    function animationsEnd(): void {
        element().querySelectorAll('.revolver-body, .chip-flight, .pass-stamp').forEach((animated: Element) => animated.dispatchEvent(new Event('animationend')));
    }

    async function until(check: () => boolean): Promise<void> {
        await eventually(async () => {
            animationsEnd();
            await fixture.whenStable();
            expect(check(), `status: ${ status() } | bottom: ${ text('#seat-bottom') } | last: ${ text('#last-move') } | badge: ${ text('.badge') } | top: ${ text('#seat-top') }`).toBe(true);
        });
    }

    async function click(label: string | RegExp): Promise<void> {
        (button(label) as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    /** Alice, the local player, sits at the bottom of her table, on the first seat; Bob on the second one */
    async function seated(rules?: RouletteRules, tampers: { alice?: Tamper; bob?: Tamper } = {}): Promise<RussianRouletteSession> {
        await table('alice', rules, tampers.alice);
        const bob: RussianRouletteSession = participant('bob', rules, tampers.bob);
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        bob.takeSeat(RouletteSeat.TWO);
        await until(() => status().startsWith('Pick the chambers'));
        return bob;
    }

    /** Both players load their bullets: the game waits for the player drawn */
    async function started(rules: RouletteRules = LIGHT, tampers: { alice?: Tamper; bob?: Tamper } = {}): Promise<RussianRouletteSession> {
        const bob: RussianRouletteSession = await seated(rules, tampers);
        // Bullets no reversed spin keeps: a spin cheated is found
        bob.load(rules.bullets === 1 ? [1] : [6, 8, 11].slice(0, rules.bullets));
        [0, 1, 3].slice(0, rules.bullets).forEach((index: number) => chamber(index).click());
        await fixture.whenStable();
        await click(/^Load/);
        await until(() => status() === 'Your turn: shoot, or pass.' || status() === 'bob shoots or passes…');
        return bob;
    }

    /** The draw gives the first move to Alice: the random parts of both players are the same, drawing the first seat */
    function aliceFirst(): void {
        vi.spyOn(CryptoHelper, 'randomHex').mockReturnValue('0'.repeat(32));
    }

    /** Alice to act: Bob passes when he plays first */
    async function aliceToAct(bob: RussianRouletteSession): Promise<void> {
        if (bob.myTurn()) {
            bob.pass();
        }
        await until(() => status() === 'Your turn: shoot, or pass.');
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<RoulettePayloads>();
        sessions = [];
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fixture.destroy();
        sessions.forEach((session: RussianRouletteSession) => session.destroy());
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test('should place the revolver again once the table is resized, and stop observing it once destroyed', async () => {
        // Given
        const observers: Array<{ resize: () => void; disconnect: ReturnType<typeof vi.fn>; targets: Element[] }> = [];
        vi.stubGlobal('ResizeObserver', class {
            public readonly disconnect = vi.fn();
            private readonly targets: Element[] = [];

            public constructor(resize: () => void) {
                observers.push({ resize, disconnect: this.disconnect, targets: this.targets });
            }

            public observe(target: Element): void {
                this.targets.push(target);
            }

            public unobserve(): void {
                // The spec resizes the table only
            }
        });
        await seated();
        const placing = vi.spyOn(TestHelper.cast<{ revolverPoint(): unknown }>(fixture.componentInstance), 'revolverPoint');
        const tableObserver = observers.find(({ targets }) => targets.includes(element().querySelector('section') as Element));

        // When
        tableObserver?.resize();
        await fixture.whenStable();

        // Then
        expect(placing).toHaveBeenCalled();

        // When
        fixture.destroy();

        // Then
        expect(tableObserver?.disconnect).toHaveBeenCalled();
    });

    test('should seat the participants on the free seats, then let the player pick and load its bullets', async () => {
        // Given the cylinder of the manga
        await table('alice', RUSSIAN_ROULETTE_RULES);
        const bob: RussianRouletteSession = participant('bob', RUSSIAN_ROULETTE_RULES);

        // Then: a single seat to take, at the bottom of the table
        expect(status()).toEqual('Waiting for two players to sit.');
        expect(text('#seat-top')).toEqual('Free seat');
        expect(text('#seat-bottom')).toEqual('Free seatSit here');
        expect(text('#bank')).toEqual('Bank: 0');
        expect(text('#table-chips')).toEqual('Table: 0 chips');

        // When
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        bob.takeSeat(RouletteSeat.TWO);
        await until(() => status() === 'Pick the chambers of your 3 bullets, then load them.');

        // Then
        expect(text('#seat-bottom')).toEqual('alice150 chips0 deathsLeave the seat');
        expect(text('#seat-top')).toEqual('bob150 chips0 deaths');
        expect(button('Load (0/3)')?.disabled).toBe(true);
        // The cylinder to load lies beside the revolver, larger, in the room of the chips of the table
        expect(element().querySelector('app-roulette-cylinder')?.parentElement?.querySelector('div')?.classList).toContain('w-36');
        expect(element().querySelector('app-roulette-cylinder')?.classList).toContain('large');
        expect(element().querySelector('#table-chips')?.parentElement?.classList).toContain('hidden');

        // When
        [0, 5, 9].forEach((index: number) => chamber(index).click());
        await fixture.whenStable();

        // Then
        expect(button('Load (3/3)')?.disabled).toBe(false);

        // When
        await click('Load (3/3)');
        await until(() => status() === 'Waiting for bob to load…');

        // Then the bullets of Alice show until the spins
        expect(Array.from(element().querySelectorAll('app-roulette-cylinder [role="img"]'), (chamberView: Element) => chamberView.getAttribute('aria-label'))
            .filter((label: string | null) => label?.endsWith('your bullet'))).toEqual(['Chamber 1: your bullet', 'Chamber 6: your bullet', 'Chamber 10: your bullet']);
        expect(text('#seat-top')).toContain('45 s');

        // When
        bob.load([1, 2, 3]);

        // Then
        await until(() => status() === 'Your turn: shoot, or pass.' || status() === 'bob shoots or passes…');
        expect(element().querySelectorAll('app-roulette-cylinder [role="img"]')).toHaveLength(24);
        expect(text('app-roulette-cylinder')).toEqual('');
    });

    test('should tell the players the cylinder waits for, and a spectator the players placing their bullets', async () => {
        // Given Carol watching
        await table('carol');
        const alice: RussianRouletteSession = participant('alice');
        const bob: RussianRouletteSession = participant('bob');
        alice.takeSeat(RouletteSeat.ONE);
        bob.takeSeat(RouletteSeat.TWO);

        // Then
        await until(() => status() === 'The players pick the chambers of their bullets.');
        expect(button(/^Load/)).toBeUndefined();

        // When
        alice.load([0, 1, 3]);

        // Then
        await until(() => status() === 'Waiting for bob to load…');

        // When Alice is late to load
        hub.hold('alice');
        bob.load([6, 8, 11]);

        // Then
        await until(() => status() === 'Loading the bullets: alice…');

        // When Bob is late to spin
        hub.release();
        hub.hold('bob');

        // Then
        await until(() => status() === 'Spinning the cylinder: bob…');
        hub.release();
        await until(() => / shoots or passes…$/.test(status()));
    });

    test('should play a game with the buttons, the moves told, until its result', async () => {
        // Given
        const bob: RussianRouletteSession = await started(SHORT);
        await aliceToAct(bob);

        // Then leaving the page asks to confirm
        expect(TestBed.inject(MatchLeaveWarning).inMatch()).toBe(true);

        // Then the cylinder spun lies beside the revolver, smaller, the chips of the table below them
        expect(element().querySelector('app-roulette-cylinder')?.parentElement?.querySelector('div')?.classList).toContain('w-36');
        expect(element().querySelector('app-roulette-cylinder')?.classList).not.toContain('large');
        expect(element().querySelector('#table-chips')?.parentElement?.classList).not.toContain('hidden');

        // When
        await click(/^Pass/);
        await until(() => bob.myTurn());

        // Then
        expect(text('#last-move')).toMatch(/^alice passes: [12] chips? on the table\.$/);
        expect(text('#table-chips')).toMatch(/^Table: [13] chips?$/);

        // When
        bob.shoot();
        await until(() => text('#last-move').startsWith('bob fires chamber 1'));
        while (fixture.componentInstance['session']().game().result() === null) {
            await until(() => button('Shoot') !== undefined || bob.myTurn() || fixture.componentInstance['session']().game().result() !== null);
            if (button('Shoot')) {
                await click('Shoot');
            } else if (bob.myTurn()) {
                bob.shoot();
            }
            await until(() => !bob.sending() && !fixture.componentInstance['session']().sending());
        }

        // Then
        await until(() => text('p.muted-note') === 'The cylinder was fair.');
        expect(text('.badge')).toMatch(/^(alice|bob) wins the game: [01] against [12] deaths?, with \d+ chips\.$|^Draw/);
        expect(history().length).toBeGreaterThan(2);
        expect(button('Play again')).toBeDefined();

        // When
        await click('Play again');
        await until(() => status().startsWith('Pick the chambers'));

        // Then
        expect(pastGames()).toEqual([expect.stringMatching(/^Game 1: .+ The cylinder was fair\.$/)]);
        expect(text('.badge')).toEqual('');
    });

    /** Every random draw of the players is the same: the spins turn the cylinder by 0, and Alice plays first */
    function fixedCylinder(): void {
        aliceFirst();
        vi.spyOn(CryptoHelper, 'randomBigInt').mockReturnValue(0n);
    }

    /** The players pass by turns, until the 5th pass in a row reveals the next chamber */
    async function passUntilRevealed(bob: RussianRouletteSession): Promise<void> {
        const session: RussianRouletteSession = fixture.componentInstance['session']();
        const revealed: number = session.game().chambers().length;
        while (session.game().chambers().length === revealed) {
            const moves: number = session.game().actions().length;
            if (bob.myTurn()) {
                bob.pass();
            } else {
                await click(/^Pass/);
            }
            await until(() => session.game().actions().length > moves && (bob.myTurn() || button(/^Pass/) !== undefined || session.game().revealing() !== null || session.over()));
            await until(() => session.game().revealing() === null);
        }
        await until(() => !/is revealed…$/.test(status()));
    }

    test('should tell the 5th pass in a row, the bank taking the table and the next chamber revealed', async () => {
        // Given
        fixedCylinder();
        const bob: RussianRouletteSession = await seated(SHORT);
        bob.load([1]);
        chamber(2).click();
        await fixture.whenStable();
        await click(/^Load/);
        await until(() => status() === 'Your turn: shoot, or pass.');

        // When
        await click(/^Pass/);

        // Then the pass is stamped on the seat of Alice, its chip flying to the table
        await eventually(async () => {
            await fixture.whenStable();
            expect(text('#seat-bottom .pass-stamp')).toEqual('Pass (1)');
        });
        const flight: Element = element().querySelector('.chip-flight') as Element;

        // When a chip inside the flight ends its own animation, then the flight is cancelled
        flight.querySelector('.chip')?.dispatchEvent(new Event('animationend', { bubbles: true }));
        await fixture.whenStable();
        expect(element().querySelectorAll('.chip-flight')).toHaveLength(1);
        flight.dispatchEvent(new Event('animationcancel'));
        await fixture.whenStable();

        // Then the chips landed
        expect(element().querySelectorAll('.chip-flight')).toHaveLength(0);

        // When
        await passUntilRevealed(bob);

        // Then
        expect(text('#bank')).toEqual('Bank: 31');
        expect(text('#last-move')).toEqual('The 5th pass of alice reveals chamber 1: empty.');
        expect(history()[1]).toEqual('alice passes, 16 chips: the 5th pass in a row, the bank takes the table.');

        // When
        await passUntilRevealed(bob);

        // Then
        expect(text('#last-move')).toEqual('The 5th pass of bob reveals chamber 2: a bullet, spent.');
    });

    test('should end a shot still firing once the next one comes', async () => {
        // Given Alice shooting, her shot still firing on her table
        aliceFirst();
        const bob: RussianRouletteSession = await started({ ...SHORT, chambers: 4 });
        await click('Shoot');
        await eventually(async () => {
            await fixture.whenStable();
            expect(bob.myTurn() || bob.over()).toBe(true);
        });
        expect(status()).toEqual('Chamber 1 fires…');
        const first: Readonly<RevolverFire> | null = revolver().shot();

        // When Bob shoots meanwhile
        if (bob.myTurn()) {
            bob.shoot();
        }

        // Then the shot of Alice is over, the one of Bob firing: a new shot for the revolver, whatever its chamber
        await eventually(async () => {
            await fixture.whenStable();
            expect(['Chamber 2 fires…', '']).toContain(status());
        });
        if (status() !== '') {
            expect(revolver().shot()).not.toBe(first);
            expect(revolver().shot()).not.toBeNull();
        }
        await until(() => /fires chamber 2|fires chamber 1/.test(text('#last-move')));
    });

    test('should send the bank the chips of the passes played together, the 5th in a row among them', async () => {
        // Given
        aliceFirst();
        await started(SHORT);
        const step: number = fixture.componentInstance['session']().step();
        hub.hold('alice');
        hub.hold('bob');

        // When the 5 passes reach the page at once
        ['alice', 'bob', 'alice', 'bob', 'alice'].forEach((name: string, index: number) =>
            rooms.get(name)?.transmitMessage(RRGameSessionType.PASS, { game: 0, step: step + index }));
        hub.release();

        // Then the chips of the 5 passes fly to the bank
        await eventually(async () => {
            await fixture.whenStable();
            expect(fixture.componentInstance['chipFlights']()['flights']().map(({ amount }) => amount)).toEqual([1, 2, 4, 8, 16, 31]);
        });
    });

    test('should forget the chambers picked for a cylinder once another one comes', async () => {
        // Given
        const bob: RussianRouletteSession = await seated();
        chamber(0).click();
        chamber(1).click();
        await fixture.whenStable();
        expect(chamber(0).getAttribute('aria-pressed')).toEqual('true');

        // When Bob leaves, then takes his seat again: a new cylinder
        bob.leaveSeat();
        await until(() => status() !== '' && !status().startsWith('Pick the chambers'));
        bob.takeSeat(RouletteSeat.TWO);
        await until(() => status().startsWith('Pick the chambers'));

        // Then
        expect(chamber(0).getAttribute('aria-pressed')).toEqual('false');
        expect(chamber(1).getAttribute('aria-pressed')).toEqual('false');
    });

    test('should stop spinning the cylinder of a game lost on time while loaded, and end no shot without one', async () => {
        // Given Alice's page not loading her bullets, her key in the chain
        const bob: RussianRouletteSession = await seated();
        bob.load([6, 8, 11]);
        hub.hold('alice');
        [0, 1, 3].forEach((index: number) => chamber(index).click());
        await fixture.whenStable();
        await click('Load (3/3)');
        await eventually(() => expect(hub.held.map(({ type }) => type)).toContain(CylinderMessageType.KEY));
        hub.held.splice(0).forEach((message: AppMessage) => hub.send(message));
        await until(() => fixture.componentInstance['spinning']());
        expect(fixture.componentInstance['loaded']()).toEqual([0, 1, 3]);

        // When Bob claims the time of her page
        await eventually(() => expect(bob.awaited()).toEqual([{ seat: RouletteSeat.ONE, own: false }]));
        bob.claimTimeout();

        // Then
        await until(() => text('.badge') === 'alice ran out of time: bob wins the game.');
        expect(fixture.componentInstance['spinning']()).toBe(false);
        expect(fixture.componentInstance['loaded']()).toEqual([]);
        expect(() => fixture.componentInstance['fired']()).not.toThrow();
        hub.held.splice(0);
    });

    test('should give the table to the shooter of an empty chamber, its chips flying to its seat', async () => {
        // Given the first chambers empty, Alice passing
        fixedCylinder();
        const bob: RussianRouletteSession = await seated(SHORT);
        bob.load([3]);
        chamber(2).click();
        await fixture.whenStable();
        await click(/^Load/);
        await until(() => status() === 'Your turn: shoot, or pass.');
        await click('Pass (1)');
        await until(() => bob.myTurn());

        // When
        bob.shoot();

        // Then
        await until(() => text('#last-move') === 'bob fires chamber 1: empty, and takes 1 chip.');
        expect(text('#seat-top')).toContain('151 chips');
    });

    test('should tell the shot of an empty chamber without chips on the table', async () => {
        // Given the first chambers empty, Alice playing first
        fixedCylinder();
        const bob: RussianRouletteSession = await seated(SHORT);
        bob.load([3]);
        chamber(2).click();
        await fixture.whenStable();
        await click(/^Load/);
        await until(() => status() === 'Your turn: shoot, or pass.');

        // When
        await click('Shoot');

        // Then
        await until(() => text('#last-move') === 'alice fires chamber 1: empty.');
    });

    test('should tell a chamber of two bullets revealed', async () => {
        // Given both players loading the first chamber
        fixedCylinder();
        const bob: RussianRouletteSession = await seated(SHORT);
        bob.load([0]);
        chamber(0).click();
        await fixture.whenStable();
        await click(/^Load/);
        await until(() => status() === 'Your turn: shoot, or pass.');

        // When
        await passUntilRevealed(bob);

        // Then the game is over, its 2 bullets spent
        expect(text('#last-move')).toEqual('The 5th pass of alice reveals chamber 1: two bullets, spent.');
        await until(() => text('.badge') !== '');
    });

    test('should make the player shoot when it can not pay the pass', async () => {
        // Given no chip
        aliceFirst();
        await started({ ...SHORT, stack: 0 });

        // When
        await until(() => status() === 'Your turn: shoot, or pass.');

        // Then
        expect(button(/^Pass/)?.disabled).toBe(true);
    });

    test('should act once on a second click, or a click on a button hidden meanwhile', async () => {
        // Given
        const bob: RussianRouletteSession = await started();
        await aliceToAct(bob);
        hub.hold('alice');
        const shoot: HTMLButtonElement = button('Shoot') as HTMLButtonElement;
        const pass: HTMLButtonElement = button(/^Pass/) as HTMLButtonElement;

        // When
        shoot.click();
        await fixture.whenStable();
        shoot.click();
        pass.click();
        fixture.componentInstance['shoot']();
        fixture.componentInstance['pass']();
        fixture.componentInstance['load']();
        fixture.componentInstance['rematch']();
        fixture.componentInstance['release'](RouletteSeat.TWO);
        hub.release();

        // Then
        await until(() => text('#last-move').startsWith('alice fires chamber 1'));
        expect(hub.delivered.filter((message: AppMessage) => message.from === 'alice' && [RRGameSessionType.SHOOT, RRGameSessionType.PASS].includes(message.type as RRGameSessionType)))
            .toHaveLength(1);
    });

    test('should show a spectator the seats from the first one, without any move', async () => {
        // Given
        await table('carol');
        const alice: RussianRouletteSession = participant('alice');
        const bob: RussianRouletteSession = participant('bob');
        alice.takeSeat(RouletteSeat.ONE);
        bob.takeSeat(RouletteSeat.TWO);
        await eventually(() => expect(alice.canLoad() && bob.canLoad()).toBe(true));
        alice.load([0, 1, 3]);
        bob.load([6, 8, 11]);

        // When
        await until(() => / shoots or passes…$/.test(status()));
        (alice.myTurn() ? alice : bob).shoot();

        // Then
        await until(() => text('#last-move') !== '');
        expect(text('#seat-bottom')).toMatch(/^alice/);
        expect(text('#seat-top')).toMatch(/^bob/);
        expect(button('Shoot')).toBeUndefined();
        expect(text('#seat-bottom button')).toEqual('');
    });

    test('should tell a chamber firing, the shares awaited', async () => {
        // Given
        const bob: RussianRouletteSession = await started();
        await aliceToAct(bob);
        hub.hold('bob');

        // When
        await click('Shoot');

        // Then
        await until(() => status() === 'Chamber 1 fires…');
        // The shares awaited, no seat shows its ring nor its clock: all eyes on the revolver
        expect(element().querySelectorAll('.acting')).toHaveLength(0);
        expect(text('#seat-top')).not.toMatch(/\d s$/);
        expect(text('#seat-bottom')).not.toMatch(/\d s$/);
        hub.release();
        await until(() => text('#last-move').startsWith('alice fires chamber 1'));
    });

    test('should tell the player its page lost its keys', async () => {
        // Given Alice loaded her bullets in a former page
        const former: RussianRouletteSession = participant('alice');
        const bob: RussianRouletteSession = participant('bob');
        former.takeSeat(RouletteSeat.ONE);
        bob.takeSeat(RouletteSeat.TWO);
        await eventually(() => expect(former.canLoad()).toBe(true));
        former.load([0, 1, 2]);
        await eventually(() => expect(bob.started()).toBe(true));

        // When her new page, the storage of the tab cleared, gets the chain again
        former.destroy();
        hub.close(rooms.get('alice') as Room<RoulettePayloads>);
        sessionStorage.clear();
        await table('alice');
        hub.replay(rooms.get('alice') as Room<RoulettePayloads>);

        // Then
        await until(() => status() === 'This page lost your keys: you can no longer play this game.');
    });

    test.each<[string, Tamper, string, boolean]>([
        ['naming the cheater of a spin not a cylinder at once, its key awaited', withheldKey, 'bob cheated on the cylinder: alice wins the game.', false],
        ['then gives it to the other player once checked', (message: AppMessage) => message, 'bob cheated on the cylinder: alice wins the game.', true],
    ])('should stop the game when the cylinder is cheated, %s', async (_: string, disclose: Tamper, badge: string, rematch: boolean) => {
        // Given
        const bob: RussianRouletteSession = await seated(undefined, {
            bob: (message: AppMessage) => message.type === CylinderMessageType.SPIN
                ? { ...message, payload: { ...(message.payload as CylinderSpinMessage), chambers: [] } }
                : disclose(message),
        });

        // When
        bob.load([1, 2, 3]);
        [0, 5, 9].forEach((index: number) => chamber(index).click());
        await fixture.whenStable();
        await click('Load (3/3)');

        // Then
        await until(() => text('.badge') === badge);
        expect(button('Play again') !== undefined).toBe(rematch);
        expect(element().querySelector('.badge')?.classList.contains('badge-win')).toBe(true);
    });

    test('should tell the game stopped by a chamber of no count, until the check of the cylinder', async () => {
        // Given Bob hides 3 bullets more in each chamber, the key of both being public, then keeps his key
        const key = (): bigint => cipher.multiplyValues(hub.delivered.filter((message: AppMessage) => message.type === CylinderMessageType.KEY)
            .map((message: AppMessage) => cipher.parseValue((message.payload as { key: string }).key) as bigint));
        const bob: RussianRouletteSession = await started(LIGHT, {
            bob: (message: AppMessage) => message.type === CylinderMessageType.SPIN
                ? {
                    ...message,
                    payload: {
                        ...(message.payload as CylinderSpinMessage),
                        chambers: (message.payload as CylinderSpinMessage).chambers
                            .map((chamber) => ExponentialElGamal.toHex(cipher.multiply(cipher.parseCipherText(chamber) as never, cipher.encrypt(3, key(), 5n)))),
                    },
                }
                : withheldKey(message),
        });

        // When the first chamber fires
        if (bob.myTurn()) {
            bob.shoot();
        } else {
            await click('Shoot');
        }

        // Then
        await until(() => text('.badge') === 'Stopped: the cylinder was cheated.');
        expect(element().querySelector('.badge')?.classList.contains('badge-draw')).toBe(true);
        expect(button('Play again')).toBeUndefined();
    });

    test('should tell a chamber loaded by both players, one death', async () => {
        // Given 2 chambers, both players loading the first one
        aliceFirst();
        const bob: RussianRouletteSession = await seated({ ...SHORT, chambers: 2 });
        bob.load([0]);
        chamber(0).click();
        await fixture.whenStable();
        await click(/^Load/);
        await until(() => status() === 'Your turn: shoot, or pass.');

        // When the chambers fire: the game is over once both bullets fired, maybe at the first shot
        await click('Shoot');
        await until(() => bob.myTurn() || text('.badge') !== '');
        if (bob.myTurn()) {
            bob.shoot();
        }

        // Then
        await until(() => text('.badge') !== '');
        expect(history().join(' ')).toMatch(/fires chamber \d: two bullets, one death\./);
    });

    test('should tell a former game on its line, with the check of its cylinder', async () => {
        // Given a game Bob lost on time, his key disclosed
        aliceFirst();
        await started(SHORT);
        await click(/^Pass/);
        await until(() => status() === 'bob shoots or passes…');
        fixture.componentInstance['session']().claimTimeout();
        await until(() => text('#seat-top') === 'Free seat' && fixture.componentInstance['session']().seatsOpen());

        // When Carol takes his seat, then Alice plays again
        const carol: RussianRouletteSession = participant('carol', SHORT);
        hub.replay(rooms.get('carol') as Room<RoulettePayloads>);
        carol.takeSeat(RouletteSeat.TWO);
        await until(() => button('Play again') !== undefined);
        await click('Play again');
        await until(() => pastGames().length > 0);

        // Then
        expect(pastGames()).toEqual(['Game 1: bob ran out of time: alice wins the game. The cylinder was fair.']);
    });

    test('should tell a former game over before its cylinder was spun, without check', async () => {
        // Given Alice not loading her bullets, Bob claims her time
        const bob: RussianRouletteSession = await seated();
        bob.load([6, 8, 11]);
        await eventually(() => expect(bob.awaited()).toEqual([{ seat: RouletteSeat.ONE, own: true }]));
        bob.claimTimeout();
        await until(() => text('#seat-bottom') === 'Free seatSit here');

        // When Alice sits again and plays again
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        await until(() => button('Play again') !== undefined);
        await click('Play again');

        // Then
        await until(() => pastGames().length > 0);
        expect(pastGames()).toEqual(['Game 1: alice ran out of time: bob wins the game.']);
    });

    describe('results', () => {
        test('should give the game to the other player of a player whose spin was cheated', async () => {
            // Given
            const bob: RussianRouletteSession = await started(LIGHT, { bob: reversedSpin });

            // When the player not to act claims the time of the other one
            (bob.myTurn() ? fixture.componentInstance['session']() : bob).claimTimeout();

            // Then
            await until(() => text('.badge') === 'bob cheated on the cylinder: alice wins the game.');
            expect(text('p.muted-note')).toEqual('The cylinder was cheated.');
        });

        test('should give no winner when both players cheated on the cylinder', async () => {
            // Given
            const bob: RussianRouletteSession = await started(LIGHT, { alice: reversedSpin, bob: reversedSpin });

            // When the player not to act claims the time of the other one
            (bob.myTurn() ? fixture.componentInstance['session']() : bob).claimTimeout();

            // Then
            await until(() => text('.badge') === 'Both players cheated on the cylinder: no winner.');
        });

        test('should tell a game lost on time', async () => {
            // Given
            const bob: RussianRouletteSession = await started(SHORT);
            await aliceToAct(bob);

            // When Bob claims the time of Alice
            bob.claimTimeout();

            // Then
            await until(() => text('.badge') === 'alice ran out of time: bob wins the game.');
            await until(() => text('p.muted-note') === 'The cylinder was fair.');
        });

        test('should tell the result provisional until the keys are disclosed, then a key withheld', async () => {
            // Given 2 chambers, each one loaded by a player, Alice disclosing another key
            const bob: RussianRouletteSession = await started({ ...SHORT, chambers: 2 }, { alice: withheldKey });

            // When the game is over
            for (let shot = 0; shot < 2; shot++) {
                await until(() => bob.myTurn() || button('Shoot') !== undefined);
                if (bob.myTurn()) {
                    bob.shoot();
                } else {
                    await click('Shoot');
                }
                await until(() => fixture.componentInstance['session']().game().chambers().length === shot + 1);
            }

            // Then
            await until(() => text('.badge') === 'Draw: both players end with as many deaths and chips.');
            expect(text('p.muted-note')).toEqual('Provisional result: the cylinder is checked once both keys are shown.');
            await until(() => status() === 'The players show their keys, to check the cylinder…');
            expect(button('Play again')).toBeUndefined();

            // When
            await eventually(() => expect(bob.awaited()).toEqual([{ seat: RouletteSeat.ONE, own: false }]));
            bob.claimTimeout();

            // Then
            await until(() => text('.badge') === 'alice did not show their key: bob wins the game.');
            expect(status()).toEqual('');
        });

        test('should tell a draw', async () => {
            // Given 2 chambers, each one loaded by a player: each player dies once
            const bob: RussianRouletteSession = await started({ ...SHORT, chambers: 2 });

            // When
            for (let shot = 0; shot < 2; shot++) {
                await until(() => bob.myTurn() || button('Shoot') !== undefined);
                if (bob.myTurn()) {
                    bob.shoot();
                } else {
                    await click('Shoot');
                }
                await until(() => fixture.componentInstance['session']().game().chambers().length === shot + 1);
            }

            // Then
            await until(() => text('.badge') === 'Draw: both players end with as many deaths and chips.');
            expect(text('#seat-bottom')).toContain('1 death');
        });
    });

    test('should let a player free the seat of the other one, away, once the game is over', async () => {
        // Given
        const bob: RussianRouletteSession = await started(SHORT);
        await aliceToAct(bob);
        bob.claimTimeout();
        await until(() => text('.badge') !== '');
        await until(() => text('#seat-bottom') === 'Free seatSit here');
        // Carol takes the seat of Alice, Alice watches
        const carol: RussianRouletteSession = participant('carol');
        hub.replay(rooms.get('carol') as Room<RoulettePayloads>);
        carol.takeSeat(RouletteSeat.ONE);
        await until(() => text('#seat-bottom').startsWith('carol'));

        // When Bob leaves, then Carol frees his seat
        hub.leave(rooms.get('bob') as Room<RoulettePayloads>);
        await fixture.whenStable();
        carol.unseat(RouletteSeat.TWO);

        // Then Alice sees the table from the seat freed
        await until(() => text('#seat-bottom') === 'Free seatSit here');
        expect(text('#seat-top')).toMatch(/^carol/);

        // When Alice takes it, then frees the seat of Carol gone
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        await until(() => text('#seat-bottom').startsWith('alice'));
        hub.leave(rooms.get('carol') as Room<RoulettePayloads>);
        await until(() => button('Free the seat') === undefined && element().querySelector('#seat-top button')?.textContent?.trim() === 'Free the seat');
        (element().querySelector('#seat-top button') as HTMLButtonElement).click();

        // Then
        await until(() => text('#seat-top') === 'Free seat');

        // When Alice leaves her seat
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();

        // Then
        await until(() => text('#seat-bottom') === 'Free seatSit here');
    });

    describe('the clock of a move', () => {
        /** The clock of the moves runs on fake timers, the room and the cylinder on real ones */
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        async function elapse(seconds: number): Promise<void> {
            vi.advanceTimersByTime(seconds * 1000);
            await fixture.whenStable();
        }

        test('should load the chambers picked, completed at random, once the time of the placing is over', async () => {
            // Given
            const bob: RussianRouletteSession = await seated();
            bob.load([1, 2, 3]);
            await until(() => text('#seat-bottom').includes('45 s'));
            chamber(4).click();

            // When
            await elapse(41);

            // Then
            expect(status()).toEqual('Your turn: time is running out.');
            await elapse(4);
            await until(() => / shoots or passes…$|^Your turn: shoot, or pass\.$/.test(status()));
            expect(fixture.componentInstance['session']().cylinder()?.bullets()).toHaveLength(3);
            expect(fixture.componentInstance['session']().cylinder()?.bullets()).toContain(4);
        });

        test('should pass for the player once the time of its move is over', async () => {
            // Given
            const bob: RussianRouletteSession = await started(SHORT);
            await aliceToAct(bob);

            // When
            await elapse(45);

            // Then
            await until(() => /^alice passes: [12] chips? on the table\.$/.test(text('#last-move')));
        });

        test('should shoot for the player who can not pay the pass once the time of its move is over', async () => {
            // Given no chip
            aliceFirst();
            await started({ ...SHORT, stack: 0 });
            await until(() => status() === 'Your turn: shoot, or pass.');

            // When
            await elapse(45);

            // Then
            await until(() => /^alice fires chamber \d/.test(text('#last-move')));
        });

        test('should give the move 30 more seconds, once, while a seated player is away, then end the game of a player away', async () => {
            // Given
            const bob: RussianRouletteSession = await started(SHORT);
            await aliceToAct(bob);
            await click(/^Pass/);
            await until(() => status() === 'bob shoots or passes…');

            // When Bob leaves the room
            hub.leave(rooms.get('bob') as Room<RoulettePayloads>);
            await elapse(1);

            // Then
            expect(status()).toEqual('Waiting for bob to come back…');
            expect(text('#seat-top')).toContain('74 s');

            // When
            await elapse(74);

            // Then
            await until(() => text('.badge') === 'bob ran out of time: alice wins the game.');
            expect(hub.types().filter((type: string) => type === RRGameSessionType.TIMEOUT)).toHaveLength(1);
        });

        test('should end the game of a player whose page withholds a share, connected or not', async () => {
            // Given
            const bob: RussianRouletteSession = await started(SHORT);
            await aliceToAct(bob);
            hub.hold('bob');

            // When
            await click('Shoot');
            // Once the share of Alice is in the chain, the game waits for the one of Bob
            await until(() => fixture.componentInstance['session']().awaited().length === 1);
            await elapse(45);

            // Then
            await until(() => text('.badge') === 'bob ran out of time: alice wins the game.');
            hub.held.splice(0);
        });

        test('should end a shot still firing, its page hidden, once the time of the next move is over', async () => {
            // Given Bob shooting, his shot still firing on the table of Alice: a hidden page plays no animation
            const bob: RussianRouletteSession = await started(SHORT);
            await aliceToAct(bob);
            await click(/^Pass/);
            await until(() => status() === 'bob shoots or passes…');
            bob.shoot();
            await eventually(async () => {
                await fixture.whenStable();
                expect(fixture.componentInstance['session']().myTurn()).toBe(true);
            });
            expect(status()).toEqual('Chamber 1 fires…');

            // When
            await elapse(45);

            // Then
            await until(() => /^alice passes: 1 chip on the table\.$/.test(text('#last-move')));
        });

        test('should leave the move of the other player, connected, to its page', async () => {
            // Given
            const bob: RussianRouletteSession = await started(SHORT);
            await aliceToAct(bob);
            await click(/^Pass/);
            await until(() => status() === 'bob shoots or passes…');

            // When
            await elapse(50);

            // Then
            expect(text('#seat-top')).toContain('0 s');
            expect(hub.types()).not.toContain(RRGameSessionType.TIMEOUT);
        });
    });
});
