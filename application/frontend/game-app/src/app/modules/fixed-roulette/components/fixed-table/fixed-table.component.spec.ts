import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';
import { ChipFlight, ChipFlightsComponent } from '@app/modules/game-table/components/chip-flights/chip-flights.component';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { PrivatePayloads } from '@app/modules/private-conversations/classes/private-messages';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { RoomHub } from '@testing/room-hub';
import { choiceFieldOption, numberFieldInput } from '@testing/text-field.helper';
import { TestHelper } from '@testing/test.helper';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, MockInstance, test, vi } from 'vitest';
import { FixedRoulettePayloads, FRGameSessionType } from '../../classes/game-sessions/fixed-roulette-messages';
import { FixedRouletteSession } from '../../classes/game-sessions/fixed-roulette-session';
import { FixedRouletteGameState, FixedRoulettePhase } from '../../classes/rules/fixed-roulette-game-state';
import { Bets, FIXED_ROULETTE_RULES, FixedRouletteRules } from '../../classes/rules/fixed-roulette-rules';
import { FIXED_ROULETTE_SESSION_OPTIONS, FixedTableComponent } from './fixed-table.component';

type Payloads = FixedRoulettePayloads & PrivatePayloads;

/** Two games a match: the specs play one to its end quickly */
const LIGHT: FixedRouletteRules = { ...FIXED_ROULETTE_RULES, games: 2 };
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('FixedTableComponent', { timeout: 30_000 }, () => {
    let hub: RoomHub<Payloads>;
    let fixture: ComponentFixture<FixedTableComponent>;
    let others: Map<string, FixedRouletteSession>;
    let rooms: Map<string, Room<Payloads>>;

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const seat = (place: 'top' | 'bottom'): HTMLElement => element().querySelector(`#seat-${ place }`) as HTMLElement;
    const buttons = (root: ParentNode = element()): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const button = (label: string, root?: ParentNode): HTMLButtonElement | undefined =>
        buttons(root).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);
    const of = (name: string): FixedRouletteSession => others.get(name) as FixedRouletteSession;
    const session = (): FixedRouletteSession => TestHelper.cast<{ session(): FixedRouletteSession }>(fixture.componentInstance).session();
    const phase = (): FixedRoulettePhase | undefined => session().game()?.phase();
    const round = (): number | undefined => session().game()?.round();
    const history = (): ReadonlyArray<string> => fixture.componentInstance.history().map(translated);
    const inMatch = (): boolean => TestHelper.cast<{ inMatch(): boolean }>(fixture.componentInstance).inMatch();
    const flights = (): ChipFlightsComponent => TestHelper.cast<{ chipFlights(): ChipFlightsComponent }>(fixture.componentInstance).chipFlights();
    const conversations = (): ReadonlyArray<Readonly<PrivateConversation>> => fixture.componentInstance.conversations().conversations();
    /** The ball the disk shows, by its kind: none while no ball shows */
    const diskBall = (): string | null => element().querySelector('circle[data-ball]')?.getAttribute('data-ball') ?? null;
    const formError = (): string => text('app-form-error');
    /** What a seat shows: its player, its part in the game and its chips */
    const seatOf = (place: 'top' | 'bottom'): ReadonlyArray<string | null> => [
        seat(place).querySelector('span')?.textContent?.trim() ?? null,
        seat(place).querySelector('.badge')?.textContent?.trim() ?? null,
        seat(place).querySelector('span.font-medium.tabular-nums')?.textContent?.trim() ?? null,
    ];
    /** The chips flown, by their amounts and delays, in the order they took off */
    const flown = (launch: MockInstance<ChipFlightsComponent['launch']>): ReadonlyArray<[number, number | undefined]> =>
        launch.mock.calls.flatMap(([launched]: [ReadonlyArray<Readonly<ChipFlight>>]) => launched.map((flight: Readonly<ChipFlight>): [number, number | undefined] => [flight.amount, flight.delay]));

    async function until(check: () => boolean): Promise<void> {
        await eventually(async () => {
            await fixture.whenStable();
            expect(check(), `status: ${ status() } | phase: ${ phase() } | awaited: ${ session().awaited() } | held: ${ hub.held.map(({ from, type }) => `${ from } ${ type }`) }`).toBe(true);
        });
        // The table shows what the check read
        await fixture.whenStable();
    }

    async function click(label: string, root?: ParentNode): Promise<void> {
        (button(label, root) as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    async function type(label: string, value: string): Promise<void> {
        const input: HTMLInputElement = numberFieldInput(element(), label);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
    }

    async function pick(label: string, option: string): Promise<void> {
        choiceFieldOption(element(), label, option).click();
        await fixture.whenStable();
    }

    /** The bets typed in the fields of the pockets, an empty one left empty */
    async function typeBets(bets: ReadonlyArray<string>): Promise<void> {
        for (const [index, chips] of bets.entries()) {
            await type(`Chips on ${ index + 1 }`, chips);
        }
    }

    /** The table of Alice in the room, Bob and Eve on their pages */
    async function table(rules: FixedRouletteRules = LIGHT): Promise<void> {
        TestBed.configureTestingModule({ providers: [{ provide: FIXED_ROULETTE_SESSION_OPTIONS, useValue: { rules } }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(FixedTableComponent);
        const room: Room<Payloads> = hub.room('alice');
        rooms.set('alice', room);
        fixture.componentRef.setInput('room', room);
        ['bob', 'eve'].forEach((name: string) => {
            const other: Room<Payloads> = hub.room(name);
            rooms.set(name, other);
            others.set(name, new FixedRouletteSession(other, { rules }));
        });
        await fixture.whenStable();
    }

    /** Alice at the bottom, the first seat, Bob at the top, Alice starts the match: she is the croupier of the first game */
    async function started(rules?: FixedRouletteRules): Promise<void> {
        await table(rules);
        await click('Sit here', seat('bottom'));
        of('bob').takeSeat(1);
        await until(() => button('Start the match') !== undefined);
        await click('Start the match');
        await until(() => status() === 'Place the ball and bet: the ball stays sealed until the punter bet.');
    }

    /** Alice places the ball and bets through her form: Bob bets next */
    async function placed(pocket: number, bets: ReadonlyArray<string>): Promise<void> {
        await pick('Pocket of the ball', String(pocket));
        await typeBets(bets);
        await click('Place the ball and bet');
        await until(() => phase() === FixedRoulettePhase.BETTING);
    }

    /** Bob, the punter, bets: Alice reveals her ball, the game is settled */
    async function betBy(name: string, bets: Bets): Promise<void> {
        const settled: number = session().step();
        await eventually(() => expect(of(name).canBet()).toBe(true));
        of(name).bet(bets);
        await until(() => session().step() > settled + 1);
    }

    /** Bob, the croupier of a game, places the ball and bets */
    async function placedBy(name: string, pocket: number, bets: Bets): Promise<void> {
        await eventually(() => expect(of(name).canPlace()).toBe(true));
        await of(name).place(pocket, bets);
        await until(() => phase() === FixedRoulettePhase.BETTING);
    }

    /** Alice, the punter, bets through her form: the game is settled once Bob's page revealed the ball */
    async function bet(bets: ReadonlyArray<string>): Promise<void> {
        const settled: number = session().step();
        await typeBets(bets);
        await click('Bet');
        await until(() => session().step() > settled + 1);
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<Payloads>();
        others = new Map();
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        // The player of the first seat is the croupier of the first game
        vi.spyOn(SeededRandom.prototype, 'below').mockResolvedValue(0);
    });

    afterEach(() => {
        fixture.destroy();
        others.forEach((other: FixedRouletteSession) => other.destroy());
        vi.restoreAllMocks();
    });

    test('should show the two seats before the match, and start it once both are taken, with the time of the bets picked', async () => {
        // Given
        await table();

        // Then the first seat at the bottom for a spectator, the only one offered
        expect(element().querySelectorAll('app-fixed-seat')).toHaveLength(2);
        expect(status()).toEqual('0 players seated: the match starts once both seats are taken.');
        expect(text('#seat-top')).toEqual('Free seat');
        expect(button('Sit here', seat('top'))).toBeUndefined();
        expect(element().querySelector('#game')).toBeNull();
        expect(text('#bank')).toEqual('Bank: 0 chips');
        expect(element().querySelectorAll('#cloth [id^="pocket-"]')).toHaveLength(4);
        expect(diskBall()).toBeNull();
        expect(conversations()).toEqual([]);

        // When
        await click('Sit here', seat('bottom'));

        // Then
        await until(() => status() === '1 player seated: the match starts once both seats are taken.');
        expect(button('Leave', seat('bottom'))).toBeDefined();

        // When
        of('bob').takeSeat(1);
        await until(() => button('Start the match') !== undefined);

        // Then
        expect(status()).toEqual('Pick the time of the bets, then start the match.');
        expect(choiceFieldOption(element(), 'Time to bet', '1 min').getAttribute('aria-checked')).toEqual('true');

        // When
        await pick('Time to bet', '30 s');
        await click('Start the match');
        await until(() => status() === 'Place the ball and bet: the ball stays sealed until the punter bet.');

        // Then
        expect(of('eve').setup()).toEqual({ betTime: 30 });
        expect([text('#game'), text('#terms')]).toEqual(['Game 1 of 2', 'Bets of 30 s']);
        expect(seatOf('bottom')).toEqual(['alice', 'Croupier', '500 chips']);
        expect(seatOf('top')).toEqual(['bob', 'Punter', '500 chips']);
        expect(text('#last-game')).toEqual('');
        expect(element().querySelector('#setup')).toBeNull();
        expect(inMatch()).toBe(true);
        expect(conversations().map((conversation: Readonly<PrivateConversation>) => [conversation.id, conversation.members, conversation.open, conversation.watched]))
            .toEqual([['fr-0-0', ['alice', 'bob'], true, true]]);
    });

    test('should tell the players seated wait for one of them to start, then the draw of the croupier', async () => {
        // Given
        await table();
        of('bob').takeSeat(0);
        of('eve').takeSeat(1);

        // Then
        await until(() => status() === 'Both players are seated: waiting for one of them to start the match.');
        expect(button('Start the match')).toBeUndefined();

        // When
        hub.hold('eve');
        await eventually(() => expect(of('bob').canStart()).toBe(true));
        of('bob').start({ betTime: 120 });

        // Then
        await until(() => status() === 'The match starts: waiting for eve.');
        expect(seatOf('top')).toEqual(['eve', null, null]);
        hub.release();

        // When
        await until(() => phase() === FixedRoulettePhase.PLACING);

        // Then a spectator sees the match from the first seat
        expect(status()).toEqual('bob places the ball and bets…');
        expect(seatOf('bottom')).toEqual(['bob', 'Croupier', '500 chips']);
        expect(text('#terms')).toEqual('Bets of 2 min');
    });

    test('should show the stakes of the top seat above, the local player seated second', async () => {
        // Given Bob in the first seat, Alice below him in the second one
        await table();
        of('bob').takeSeat(0);
        await until(() => session().players().length === 1);
        await click('Sit here', seat('bottom'));
        await until(() => button('Start the match') !== undefined);
        await click('Start the match');
        await until(() => phase() === FixedRoulettePhase.PLACING);

        // Then
        expect(seatOf('top')).toEqual(['bob', 'Croupier', '500 chips']);
        expect(status()).toEqual('bob places the ball and bets…');

        // When
        await placedBy('bob', 1, [0, 0, 7, 0]);

        // Then
        expect(text('[data-stake="3-top"]')).toEqual('7');
        expect(text('[data-stake="3-bottom"]')).toEqual('');
        expect(element().querySelector('#pocket-3')?.getAttribute('aria-label')).toEqual('Pocket 3, bob: 7 chips');
        expect(diskBall()).toBeNull();
        expect(status()).toEqual('Bet, reading the bets of bob.');
        expect(text('#bet-form p')).toEqual('bob bets 7 chips: bet as many at least, on 2 pockets at most.');
    });

    test('should seal the ball the croupier places on its page only, refuse the bets beyond the rules, then settle the game', async () => {
        // Given
        await started();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const launch = vi.spyOn(flights(), 'launch');

        // When nothing is picked nor bet
        await click('Place the ball and bet');

        // Then
        expect(text('app-choice-field mat-error')).toEqual('Pick the pocket of the ball');
        expect(formError()).toEqual('Bet 1 chip at least');

        // When
        await type('Chips on 1', '-1');

        // Then
        expect(text('app-number-field mat-error')).toEqual('No negative bet');

        // When
        await type('Chips on 1', '1.5');

        // Then
        expect(text('app-number-field mat-error')).toEqual('Bet whole chips');

        // When
        await pick('Pocket of the ball', '2');
        await type('Chips on 1', '501');
        await click('Place the ball and bet');

        // Then
        expect(formError()).toEqual('You hold 500 chips only');
        expect(hub.types()).not.toContain(FRGameSessionType.COMMIT);

        // When its commitment waits for the chain
        hub.hold('alice');
        await typeBets(['', '15', '50', '']);
        await click('Place the ball and bet');

        // Then only its page knows the ball
        await until(() => status() === 'Your ball is sealed: bob bets next…');
        expect(text('app-fixed-wheel p')).toEqual('Your ball, sealed: pocket 2');
        expect(diskBall()).toEqual('sealed');
        expect(element().querySelector('#pocket-2')?.classList).toContain('outline-dashed');

        // When
        hub.release();
        await until(() => phase() === FixedRoulettePhase.BETTING);

        // Then
        expect(status()).toEqual('bob bets…');
        expect(seatOf('bottom')).toEqual(['alice', 'Croupier', '435 chips']);
        expect(element().querySelector('#pocket-2')?.getAttribute('aria-label')).toEqual('Pocket 2, your ball, sealed, alice: 15 chips');
        expect(of('bob').myBall()).toBeNull();
        expect(of('eve').myBall()).toBeNull();
        expect(flown(launch)).toEqual([[15, 0], [50, 0]]);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS, 0);

        // When the reveal of Alice waits
        hub.hold('alice');
        await eventually(() => expect(of('bob').canBet()).toBe(true));
        of('bob').bet([0, 35, 0, 30]);

        // Then
        await until(() => status() === 'The ball is revealed…');
        expect(text('[data-stake="4-top"]')).toEqual('30');

        // When
        hub.release();
        await until(() => round() === 1);

        // Then the shares of the chips lost, 15 to 35, and the ball of the game until the next one is placed
        const settled: string = 'Game 1: ball in pocket 2, both players on it. alice (croupier) −26 chips, bob (punter) +26 chips';
        expect(text('#last-game')).toEqual(settled);
        expect(history()).toEqual([settled]);
        expect(seatOf('bottom')).toEqual(['alice', 'Punter', '474 chips']);
        expect(seatOf('top')).toEqual(['bob', 'Croupier', '526 chips']);
        expect(text('app-fixed-wheel p')).toEqual('Last ball: pocket 2');
        expect(diskBall()).toEqual('last');
        expect(text('[data-stake="2-bottom"]')).toEqual('');
        expect(flown(launch).slice(2)).toEqual([[35, 0], [30, 0], [15, 700], [35, 700], [24, 700], [26, 700], [30, 700]]);
        expect(play).toHaveBeenCalledWith(SoundEffect.FIXED_BALL_DROP, 0);
        expect(play).toHaveBeenCalledWith(SoundEffect.POKER_POT_LOST, 0.7);
        expect(status()).toEqual('bob places the ball and bets…');

        // When the croupier of the second game places its own ball
        await placedBy('bob', 3, [10, 0, 0, 0]);

        // Then no ball shows on the page of the punter
        expect(diskBall()).toBeNull();
        expect(text('app-fixed-wheel p')).toEqual('');
        expect(element().querySelector('#pocket-3')?.getAttribute('aria-label')).toEqual('Pocket 3');
    });

    test('should let the punter bet as many chips as the croupier on 2 pockets at most, then end the match', async () => {
        // Given Bob places the second ball
        await started();
        await placed(1, ['1', '', '', '']);
        await betBy('bob', [1, 0, 0, 0]);
        await placedBy('bob', 3, [0, 0, 10, 0]);
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When nothing is bet
        await click('Bet');

        // Then
        expect(formError()).toEqual('Bet 10 chips at least, as many as bob');

        // When
        await typeBets(['5', '5', '5', '']);

        // Then
        expect(formError()).toEqual('Bet on 2 pockets at most');

        // When
        await typeBets(['600', '', '', '']);

        // Then
        expect(formError()).toEqual('You hold 500 chips only');
        expect(hub.delivered.filter(({ from, type: sent }) => from === 'alice' && sent === FRGameSessionType.BET)).toEqual([]);

        // When the reveal of Bob waits
        hub.hold('bob');
        await typeBets(['', '', '10', '']);
        await click('Bet');

        // Then
        await until(() => status() === 'The ball is revealed…');

        // When
        hub.release();
        await until(() => session().over());

        // Then
        expect(status()).toEqual('The match is over.');
        expect(text('#last-game')).toEqual('Game 2: ball in pocket 3, both players on it. bob (croupier) 0 chips, alice (punter) 0 chips');
        expect(text('#result')).toEqual('A draw, 500 chips each');
        expect(element().querySelector('#result')?.classList).toContain('badge-draw');
        expect(seatOf('bottom')).toEqual(['alice', null, '500 chips']);
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS, 0.7);
        expect(play).toHaveBeenCalledWith(SoundEffect.GAME_DRAW, expect.any(Number));
        expect(history()).toHaveLength(2);
        expect(inMatch()).toBe(false);
        expect(conversations().map((conversation: Readonly<PrivateConversation>) => conversation.open)).toEqual([false]);

        // When
        await click('Play again');

        // Then the conversation of the match over kept, closed
        await until(() => fixture.componentInstance.pastResults().length === 1);
        expect(pastLine(fixture.componentInstance.pastResults()[0])).toEqual('Match 1: A draw, 500 chips each');
        expect(status()).toEqual('Pick the time of the bets, then start the match.');
        expect(element().querySelector('#game')).toBeNull();
        expect(text('#last-game')).toEqual('');
        expect(conversations().map((conversation: Readonly<PrivateConversation>) => [conversation.id, conversation.open])).toEqual([['fr-0-0', false]]);
    });

    test('should ask the punter holding fewer chips than the croupier for all of them, the bank taking the chips off the ball', async () => {
        // Given 10 chips each, Bob winning 4 of Alice in the first game
        await started({ ...LIGHT, startChips: 10 });
        await placed(2, ['4', '', '', '']);
        const launch = vi.spyOn(flights(), 'launch');
        await betBy('bob', [0, 4, 0, 0]);
        await placedBy('bob', 2, [8, 0, 0, 0]);

        // Then
        expect(text('#bet-form p')).toEqual('bob bets 8 chips: bet all your chips, on 2 pockets at most.');

        // When
        await typeBets(['5', '', '', '']);
        await click('Bet');

        // Then
        expect(formError()).toEqual('You hold fewer chips than bob bet: bet all your chips');

        // When
        await bet(['6', '', '', '']);

        // Then
        await until(() => session().over());
        expect(text('#last-game')).toEqual('Game 2: ball in pocket 2, no one on it. bob (croupier) −8 chips, alice (punter) −6 chips');
        expect(text('#bank')).toEqual('Bank: 14 chips');
        expect(text('#result')).toEqual('bob wins: alice has no chip left');
        expect(element().querySelector('#result')?.classList).toContain('badge-win');
        expect(flown(launch).filter(([, delay]: [number, number | undefined]) => delay === 700)).toEqual([[4, 700], [4, 700], [8, 700], [6, 700]]);
    });

    test('should forfeit the punter not betting in time, the bets of the croupier flying back', async () => {
        // Given
        await started();
        await placed(1, ['3', '', '', '']);
        const launch = vi.spyOn(flights(), 'launch');

        // When the time of the bet is over
        await eventually(() => expect(of('bob').canBet()).toBe(true));
        hub.time = LATER;
        session().claimTimeout();

        // Then
        await until(() => session().over());
        expect(text('#last-game')).toEqual('Game 1: bob does not bet in time and loses the match');
        expect(text('#result')).toEqual('alice wins: bob does not bet in time');
        expect(seatOf('bottom')).toEqual(['alice', null, '500 chips']);
        expect(flown(launch)).toEqual([[3, 0]]);
    });

    test('should forfeit the croupier not placing in time, no chip moving', async () => {
        // Given
        await started();
        const launch = vi.spyOn(flights(), 'launch');

        // When
        hub.time = LATER;
        of('bob').claimTimeout();

        // Then
        await until(() => session().over());
        expect(text('#result')).toEqual('bob wins: alice does not place the ball in time');
        expect(flown(launch)).toEqual([]);
    });

    test('should forfeit the croupier not revealing in time, the bets of both players flying back', async () => {
        // Given Bob places the second ball, Alice bets, Bob's reveal held
        await started();
        await placed(1, ['1', '', '', '']);
        await betBy('bob', [1, 0, 0, 0]);
        await placedBy('bob', 4, [0, 0, 0, 2]);
        const launch = vi.spyOn(flights(), 'launch');
        hub.hold('bob');
        await typeBets(['2', '', '', '']);
        await click('Bet');
        await until(() => phase() === FixedRoulettePhase.REVEALING);

        // When
        hub.time = LATER;
        session().claimTimeout();

        // Then
        await until(() => session().over());
        expect(text('#result')).toEqual('alice wins: bob does not reveal the ball in time');
        expect(flown(launch)).toEqual([[2, 0], [2, 0], [2, 0]]);
        hub.release();
    });

    test('should hear the chips moved, without their flights, on a page hidden', async () => {
        // Given
        await started();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const launch = vi.spyOn(flights(), 'launch');

        // When
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await placed(1, ['5', '', '', '']);

        // Then
        expect(play).toHaveBeenCalledWith(SoundEffect.CHIPS, 0);
        expect(launch).not.toHaveBeenCalled();
    });

    test('should fly no chip to a player gone from its seat before the table shows the last game', async () => {
        // Given the last game, Bob placing, Alice betting
        await started();
        await placed(1, ['1', '', '', '']);
        await betBy('bob', [1, 0, 0, 0]);
        await placedBy('bob', 4, [0, 3, 0, 1]);
        const launch = vi.spyOn(flights(), 'launch');
        // Bob leaves his seat as the match is over, in the same turn as his reveal
        const game: FixedRouletteGameState = session().game() as FixedRouletteGameState;
        const reveal: FixedRouletteGameState['reveal'] = game.reveal.bind(game);
        vi.spyOn(game, 'reveal').mockImplementation((player: number, ball: unknown): Applied => {
            const applied: Applied = reveal(player, ball);
            session().tableSeats.free(1);
            return applied;
        });

        // When both players on the pocket of the ball, Alice taking the chips lost
        await bet(['', '', '', '4']);

        // Then
        await until(() => session().over());
        expect(text('#seat-top')).toEqual('Free seat');
        expect(text('#result')).toEqual('alice wins, 503 chips to 497 chips');
        // The chips of Alice back to her and the chips of Bob won by her, none flying back to Bob
        expect(flown(launch).filter(([, delay]: [number, number | undefined]) => delay === 700)).toEqual([[4, 700], [3, 700]]);
    });

    test('should show a player out of the match taking a seat once it is over, and let a player free the seat of a player away', async () => {
        // Given a match over
        await started();
        await placed(1, ['1', '', '', '']);
        await betBy('bob', [1, 0, 0, 0]);
        await placedBy('bob', 1, [1, 0, 0, 0]);
        await bet(['1', '', '', '']);
        await until(() => session().over());
        expect(seatOf('top')).toEqual(['bob', null, '500 chips']);

        // When Bob leaves his seat to Eve
        of('bob').leaveSeat();
        await until(() => text('#seat-top') === 'Free seat');
        of('eve').takeSeat(1);

        // Then
        await until(() => seatOf('top')[0] === 'eve');
        expect(seatOf('top')).toEqual(['eve', null, null]);

        // When Eve leaves the room
        hub.leave(rooms.get('eve') as Room<Payloads>);
        await until(() => button('Free the seat', seat('top')) !== undefined);
        await click('Free the seat', seat('top'));

        // Then
        await until(() => text('#seat-top') === 'Free seat');

        // When
        await click('Leave', seat('bottom'));

        // Then
        await until(() => session().tableSeats.mySeat() === null);
    });

    test('should let the host, a spectator, free the seat below of a player away', async () => {
        // Given Bob and Eve seated, Alice the host
        await table();
        hub.sequencer.set('alice');
        of('bob').takeSeat(0);
        of('eve').takeSeat(1);
        await until(() => session().players().length === 2);

        // When
        hub.leave(rooms.get('bob') as Room<Payloads>);
        await until(() => button('Free the seat', seat('bottom')) !== undefined);
        await click('Free the seat', seat('bottom'));

        // Then
        await until(() => session().players().length === 1);
        expect(seatOf('bottom')).toEqual(['Free seat', null, null]);
        expect(button('Sit here', seat('bottom'))).toBeDefined();
    });

    describe('the clock', () => {
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

        test('should hurry the croupier, then claim the time over, its ball not placed', async () => {
            // Given
            await started();

            // When
            await elapse(LIGHT.defaultBetTime - 4);

            // Then
            expect(status()).toEqual('Hurry: your time runs out!');
            expect(text('#clock')).toEqual('0:04');
            expect(text('#seat-bottom')).toContain('0:04');

            // When
            hub.time = LATER;
            await elapse(4);

            // Then
            await until(() => session().over());
            expect(text('#result')).toEqual('bob wins: alice does not place the ball in time');
        });

        test('should wait longer for a punter away', async () => {
            // Given
            await started();
            await placed(1, ['1', '', '', '']);

            // When
            hub.leave(rooms.get('bob') as Room<Payloads>);

            // Then
            await until(() => status() === 'Waiting for bob to come back…');
            await elapse(LIGHT.defaultBetTime - 1);
            expect(text('#clock')).toEqual(`0:${ LIGHT.awayTime + 1 }`);
            expect(text('#seat-top')).toContain(`0:${ LIGHT.awayTime + 1 }`);
        });
    });
});
