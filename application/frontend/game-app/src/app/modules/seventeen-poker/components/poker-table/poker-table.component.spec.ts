import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { DeckVerification, MentalDeck } from '@app/modules/mental-poker/classes/mental-deck';
import { SraCipher } from '@app/modules/mental-poker/classes/sra-cipher';
import { MentalDeckMessageType } from '@app/modules/mental-poker/mental-deck-messages';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { TEST_GROUP } from '@testing/sra-test-group';
import { pastLine, translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PokerPayloads, SeventeenPokerSession, SPGameSessionType } from '../../classes/game-sessions/seventeen-poker-session';
import { BetAction } from '../../classes/rules/betting-round';
import { HandEnd, PokerMatchRules, SEVENTEEN_POKER_RULES } from '../../classes/rules/poker-match';
import { PokerSeat } from '../../classes/rules/poker-seat';
import { POKER_SESSION_OPTIONS, PokerTableComponent } from './poker-table.component';

const cipher = new SraCipher(TEST_GROUP);
const FACE_DOWN: string[] = Array.from({ length: 5 }, () => 'Face-down card');

type Tamper = (message: AppMessage) => AppMessage;

describe('PokerTableComponent', () => {
    let hub: RoomHub<PokerPayloads>;
    let fixture: ComponentFixture<PokerTableComponent>;
    let sessions: SeventeenPokerSession[];
    let rooms: Map<string, Room<PokerPayloads>>;

    /** The table of the local participant */
    async function table(name: string, rules: PokerMatchRules = SEVENTEEN_POKER_RULES): Promise<void> {
        // The warning before leaving a match is provided by the page
        TestBed.configureTestingModule({ providers: [{ provide: POKER_SESSION_OPTIONS, useValue: { cipher, rules } }, MatchLeaveWarning] });
        fixture = TestBed.createComponent(PokerTableComponent);
        fixture.componentRef.setInput('room', hub.room(name));
        await fixture.whenStable();
    }

    /** Another participant of the room */
    function participant(name: string, rules: PokerMatchRules = SEVENTEEN_POKER_RULES, tamper?: Tamper): SeventeenPokerSession {
        const room: Room<PokerPayloads> = hub.room(name, tamper);
        const session = new SeventeenPokerSession(room, { cipher, rules });
        rooms.set(name, room);
        sessions.push(session);
        return session;
    }

    const element = (): HTMLElement => fixture.nativeElement;
    const text = (selector: string): string => element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const status = (): string => text('output');
    const button = (label: string): HTMLButtonElement | undefined => Array.from(element().querySelectorAll<HTMLButtonElement>('button'))
        .find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label);
    /** The names of the cards of a hand, from the top of the table */
    const cards = (index: number): string[] => Array.from(
        element().querySelectorAll('app-card-hand')[index].querySelectorAll('[role="img"]'),
        (image: Element) => image.getAttribute('aria-label') as string,
    );

    /** The values of the chips flying over the table, for each move */
    const flights = (): string[][] => Array.from(
        element().querySelectorAll('.chip-flight'),
        (flight: Element) => Array.from(flight.querySelectorAll('.chip'), (chip: Element) => (chip as HTMLElement).dataset['value'] as string),
    );

    /** The chips flying over the table land */
    async function landed(): Promise<void> {
        element().querySelectorAll('.chip-flight').forEach((flight: Element) => flight.dispatchEvent(new Event('animationend')));
        await fixture.whenStable();
    }

    /** The outcome of the latest hand of the match, as the history of the room shows it */
    const latestHand = (): string => translated(fixture.componentInstance.history()[0]);
    /** The result of the latest match over, as the history of the room shows it */
    const latestMatch = (): string => pastLine(fixture.componentInstance.pastResults()[0]);

    /** The values of the chips of a stack */
    const chipValues = (selector: string): string[] => Array.from(
        element().querySelectorAll(`${ selector } .chip`),
        (chip: Element) => (chip as HTMLElement).dataset['value'] as string,
    );

    async function until(check: () => boolean): Promise<void> {
        await vi.waitFor(async () => {
            await fixture.whenStable();
            expect(check()).toBe(true);
        });
    }

    async function click(label: string): Promise<void> {
        (button(label) as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    /** Alice, the local player, sits at the bottom of her table, on the first seat; Bob on the second one, dealing first */
    async function seated(rules?: PokerMatchRules, tamper?: Tamper): Promise<SeventeenPokerSession> {
        await table('alice', rules);
        const bob: SeventeenPokerSession = participant('bob', rules, tamper);
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        bob.takeSeat(PokerSeat.TWO);
        await until(() => status() === 'bob to deal.');
        return bob;
    }

    /** Bob deals the hand, then Alice reads her cards */
    async function dealt(rules?: PokerMatchRules, tamper?: Tamper): Promise<SeventeenPokerSession> {
        const bob: SeventeenPokerSession = await seated(rules, tamper);
        bob.deal();
        await until(() => status() === 'Your turn.');
        return bob;
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<PokerPayloads>();
        sessions = [];
        rooms = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fixture.destroy();
        sessions.forEach((session: SeventeenPokerSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should seat the participants on the free seats, a spectator seeing the table from the seat it may take', async () => {
        // Given
        await table('alice');
        const bob: SeventeenPokerSession = participant('bob');

        // Then: a single seat to take, at the bottom of the table
        expect(status()).toEqual('Waiting for two players to sit.');
        expect(text('#seat-top')).toEqual('Free seat');
        expect(text('#seat-bottom')).toEqual('Free seatSit here');

        // When: Bob sits on the first seat
        bob.takeSeat(PokerSeat.ONE);
        await fixture.whenStable();

        // Then: the second seat comes at the bottom
        expect(text('#seat-top')).toEqual('bob150 chips');
        expect(text('#seat-bottom')).toEqual('Free seatSit here');

        // When: Alice sits there
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        await until(() => status() === 'Your turn to deal.');

        // Then
        expect(text('#seat-bottom')).toEqual('alice150 chipsLeave the seat');
        expect(text('#seat-top')).toEqual('bob150 chips');
        expect(text('app-card-deck span')).toEqual('17');
        expect(element().textContent).toContain('Pot 0');
        expect(element().textContent).toContain('Spectators: 0');

        // When
        await click('Leave the seat');
        await until(() => status() === 'Waiting for two players to sit.');

        // Then: the free seat comes back at the bottom
        expect(text('#seat-bottom')).toEqual('Free seatSit here');
        expect(text('#seat-top')).toEqual('bob150 chips');
    });

    test('should deal the hand, the cards of the player only face up', async () => {
        // When
        await dealt();

        // Then: leaving the page asks to confirm
        expect(TestBed.inject(MatchLeaveWarning).inMatch()).toBe(true);
        expect(cards(1)).not.toContain('Face-down card');
        expect(cards(0)).toEqual(FACE_DOWN);
        expect(text('app-card-deck span')).toEqual('7');
        expect(element().textContent).toContain('Pot 10');
        expect(element().textContent).toContain('Hand 1 of 10');
        // The clock started meanwhile
        expect(text('#seat-bottom')).toMatch(/^alice145 chips4[45] s$/);
        expect(element().querySelector('#seat-bottom .seat')?.classList).toContain('acting');
        expect(button('Check')).toBeDefined();
        expect(button('Fold')).toBeUndefined();
    });

    test('should set the amount of a bet within its bounds', async () => {
        // Given
        await dealt();

        // When: the flights of the antes are cancelled
        expect(flights()).toEqual([['5'], ['5']]);
        element().querySelectorAll('.chip-flight').forEach((flight: Element) => flight.dispatchEvent(new Event('animationcancel')));
        await fixture.whenStable();

        // Then
        expect(flights()).toEqual([]);

        // Then
        expect(button('Bet 1')).toBeDefined();
        expect(button('Bet less')?.disabled).toBe(true);

        // When
        await click('Bet more');
        await click('Bet more');

        // Then
        expect(button('Bet 11')).toBeDefined();

        // When
        await click('Max');

        // Then
        expect(button('Bet 145')).toBeDefined();
        expect(button('Bet more')?.disabled).toBe(true);

        // When
        await click('Bet less');
        await click('Min');

        // Then
        expect(button('Bet 1')).toBeDefined();

        // When: the chips move while the page is hidden
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await click('Bet 1');
        await until(() => status() === 'bob to speak.');

        // Then: they do not fly
        expect(flights()).toEqual([]);
    });

    test('should play a hand to the showdown', async () => {
        // Given
        const bob: SeventeenPokerSession = await dealt();

        // When: Alice bets, Bob raises
        await landed();
        await click('Bet more');
        await click('Bet 6');
        await until(() => status() === 'bob to speak.');

        // Then: her bet lies in front of her, out of the pot, flying there from her stack
        expect(flights()).toEqual([['5', '1']]);
        expect(text('#seat-bottom')).toEqual('alice139 chips');

        // When: the chips land, a chip inside them ending its own animation first
        const flight: HTMLElement = element().querySelector('.chip-flight') as HTMLElement;
        flight.querySelector('.chip')?.dispatchEvent(new Event('animationend', { bubbles: true }));
        await fixture.whenStable();

        // Then
        expect(flights()).toHaveLength(1);

        // When
        flight.dispatchEvent(new Event('animationend'));
        await fixture.whenStable();

        // Then
        expect(flights()).toEqual([]);
        expect(text('#bet-bottom')).toEqual('Bet 6');
        expect(chipValues('#bet-bottom')).toEqual(['5', '1']);
        expect(chipValues('#bet-top')).toEqual([]);
        expect(chipValues('#seat-bottom')).toEqual(['100', '25', '5', '5', '1', '1', '1', '1']);
        expect(element().textContent).toContain('Pot 16');
        expect(chipValues('.pot')).toEqual(['5', '5']);
        expect(element().querySelector('#seat-top .seat')?.classList).toContain('acting');

        // When
        bob.bet(BetAction.RAISE, 12);
        await until(() => status() === 'Your turn.');

        // Then
        expect(button('Call 6')).toBeDefined();
        expect(button('Raise to 13')).toBeDefined();
        expect(button('Fold')).toBeDefined();
        expect(button('Check')).toBeUndefined();

        // When: Alice calls, then discards two cards
        await landed();
        await click('Call 6');
        await until(() => status() === 'Select the cards to discard, then exchange them.');
        const kept: string[] = cards(1).slice(2);
        const hand: HTMLButtonElement[] = Array.from(element().querySelectorAll('app-card-hand')[1].querySelectorAll('button'));
        expect(button('Keep my hand')).toBeDefined();
        hand[0].click();
        hand[1].click();
        await fixture.whenStable();

        // Then: the bets went to the pot
        // Alice's bet and her call, then Bob's bet
        expect(flights()).toEqual([['5', '1'], ['5', '1'], ['5', '5', '1', '1']]);
        expect(button('Exchange 2 cards')).toBeDefined();
        expect(chipValues('#bet-bottom')).toEqual([]);
        expect(chipValues('.pot')).toEqual(['25', '5', '1', '1', '1', '1']);

        // When
        await click('Exchange 2 cards');
        await until(() => status() === 'bob exchanges cards.');

        // Then
        expect(text('app-card-deck span')).toEqual('5');

        // When: Bob keeps his hand, both players check
        bob.exchange([]);
        await until(() => status() === 'Your turn.');
        await click('Check');
        await until(() => status() === 'bob to speak.');
        bob.bet(BetAction.CHECK);
        await until(() => status() === 'Your turn to deal.');

        // Then: both hands are shown, the best one outlined, the other one dimmed
        const outcome = bob.match().hand()?.outcome;
        const categories: string[] = Array.from(element().querySelectorAll('p.table-line'), (line: Element) => line.textContent?.trim() as string);
        expect(categories).toHaveLength(2);
        expect(text('#hand-outcome')).toEqual(latestHand());
        expect(chipValues('.pot')).toEqual([]);
        const hands: Element[] = Array.from(element().querySelectorAll('app-card-hand'));
        expect(hands[1].classList.contains('opacity-50')).toEqual(outcome?.winner === PokerSeat.TWO);
        expect(hands[0].classList.contains('opacity-50')).toEqual(outcome?.winner === PokerSeat.ONE);
        expect(outcome?.end).toEqual(HandEnd.SHOWDOWN);
        expect(cards(0)).not.toContain('Face-down card');
        expect(cards(1).slice(2)).toEqual(kept);
        expect(element().textContent).toContain('Pot 0');
        expect(latestHand()).toMatch(/^Hand 1: /);
        const outlined = (index: number): boolean => Array.from(element().querySelectorAll('app-card-hand')[index].querySelectorAll('[role="img"]'))
            .every((image: Element) => image.classList.contains('outline-3'));
        expect(outlined(1)).toEqual(outcome?.winner === PokerSeat.ONE);
        expect(outlined(0)).toEqual(outcome?.winner === PokerSeat.TWO);
    });

    describe('the clock of a move', () => {
        /** The clock of the moves runs on fake timers, the room and the decks on real ones */
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

        test('should check for the player once the time of its move is over, and fold against a bet', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt();

            // When
            await elapse(40);

            // Then: the status tells the time runs out, once
            expect(status()).toEqual('Your turn: time is running out.');

            // When
            await elapse(4);

            // Then
            expect(status()).toEqual('Your turn: time is running out.');
            expect(text('#seat-bottom')).toEqual('alice145 chips1 s');
            expect(text('#seat-top')).toEqual('bob145 chips');

            // When: the time is over
            await elapse(1);
            await until(() => status() === 'bob to speak.');

            // Then: Alice checked, the clock of Bob starts
            expect(bob.match().hand()?.round.bets).toEqual([0, 0]);
            expect(text('#seat-bottom')).toEqual('alice145 chips');
            expect(text('#seat-top')).toEqual('bob145 chips45 s');

            // When
            bob.bet(BetAction.BET, 5);
            await until(() => status() === 'Your turn.');
            await elapse(45);
            await until(() => status() === 'Your turn to deal.');

            // Then
            expect(latestHand()).toEqual('Hand 1: alice folds, bob takes the pot of 15.');
        });

        test('should keep the hand of the player once the time of its exchange is over', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt();
            await click('Bet 1');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.CALL);
            await until(() => status() === 'Select the cards to discard, then exchange them.');
            const kept: string[] = cards(1);
            element().querySelectorAll('app-card-hand')[1].querySelector('button')?.click();
            await fixture.whenStable();

            // When
            await elapse(40);

            // Then
            expect(status()).toEqual('Exchange your cards: time is running out.');

            // When
            await elapse(5);
            await until(() => status() === 'bob exchanges cards.');

            // Then: the card selected stays in the hand
            expect(bob.match().hand()?.exchanges).toEqual([0, null]);
            expect(cards(1)).toEqual(kept);
            expect(button('Exchange 1 card')).toBeUndefined();
        });

        test('should start the clock again for each move of a seat acting twice in a row', async () => {
            // Given: Alice bets, Bob calls, then Alice exchanges first
            const bob: SeventeenPokerSession = await dealt();
            await elapse(10);
            await click('Bet 1');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.CALL);
            await until(() => status() === 'Select the cards to discard, then exchange them.');

            // Then
            expect(text('#seat-bottom')).toEqual('alice144 chips45 s');
            expect((element().querySelector('#seat-bottom .turn-clock') as HTMLElement).style.width).toEqual('100%');
        });

        test('should give the move 30 more seconds, once, while a seated player is away, then end the match of a player away', async () => {
            // Given
            await dealt();
            await elapse(10);
            participant('carol');
            await fixture.whenStable();

            // Then: a spectator joining changes nothing
            expect(text('#seat-bottom')).toEqual('alice145 chips35 s');

            // When: Bob leaves the room
            hub.leave(rooms.get('bob') as Room<PokerPayloads>);
            await elapse(1);

            // Then: Alice plays meanwhile, with 30 more seconds
            expect(status()).toEqual('Your turn.');
            expect(text('#seat-bottom')).toEqual('alice145 chips64 s');

            // When: Bob comes back, then leaves again
            const back: Room<PokerPayloads> = hub.room('bob');
            await elapse(1);
            hub.leave(back);
            await elapse(1);

            // Then: no more time
            expect(text('#seat-bottom')).toEqual('alice145 chips62 s');

            // When: the time of Alice is over, then the one of Bob, away: 45 seconds and 30 more
            await elapse(62);
            await until(() => status() === 'Waiting for bob to come back…');
            expect(text('#seat-top')).toEqual('bob145 chips45 s');
            await elapse(75);
            await until(() => text('.badge') !== '');

            // Then
            expect(text('.badge')).toEqual('bob was away when the time ran out: alice wins the match.');
            expect(latestHand()).toEqual('Hand 1: bob folds, alice takes the pot of 10.');
            expect(hub.types().filter((type: string) => type === SPGameSessionType.TIMEOUT)).toHaveLength(1);
            // Bob loses his seat, Alice may start a new match once another participant takes it
            expect(text('#seat-top')).toEqual('Free seat');
            expect(button('Play again')).toBeUndefined();
            expect(text('p.muted-note')).toEqual('Checking every deck…');
        });

        test('should play nothing once the time is over while the action of the player waits for the chain', async () => {
            // Given
            await dealt();
            hub.hold('alice');
            await click('Check');

            // When
            await elapse(45);
            hub.release();
            await until(() => status() === 'bob to speak.');

            // Then: the check sent is the move
            expect(hub.types().filter((type: string) => type === SPGameSessionType.BET || type === SPGameSessionType.TIMEOUT)).toEqual([SPGameSessionType.BET]);
        });

        test('should leave the move of the other player to its page', async () => {
            // Given
            await dealt();
            await click('Check');
            await until(() => status() === 'bob to speak.');

            // When
            await elapse(50);

            // Then: the clock of Bob stops at 0, his move awaited
            expect(text('#seat-top')).toEqual('bob145 chips0 s');
            expect(status()).toEqual('bob to speak.');
        });
    });

    test('should raise or fold against a bet', async () => {
        // Given
        const bob: SeventeenPokerSession = await dealt();
        await click('Bet 1');
        await until(() => status() === 'bob to speak.');
        bob.bet(BetAction.RAISE, 2);
        await until(() => status() === 'Your turn.');

        // When
        await click('Raise to 3');
        await until(() => status() === 'bob to speak.');
        bob.bet(BetAction.RAISE, 4);
        await until(() => status() === 'Your turn.');
        await landed();
        await click('Fold');
        await until(() => status() === 'Your turn to deal.');

        // Then: the pot goes to Bob, at the top of the table
        expect(latestHand()).toEqual('Hand 1: alice folds, bob takes the pot of 17.');
        expect(text('#hand-outcome')).toEqual('Hand 1: alice folds, bob takes the pot of 17.');
        expect(text('#seat-bottom')).toEqual('alice142 chips');
        expect(text('#seat-top')).toEqual('bob158 chips +17');
        // A folded hand is not shown: no kind of hand
        expect(Array.from(element().querySelectorAll('p.table-line'), (line: Element) => line.textContent?.trim())).toEqual(['', '']);
        // The pot flies to Bob, the bets with it
        expect(flights()).toEqual([['1', '1', '1'], ['1', '1', '1', '1'], ['5', '5']]);
    });

    test('should show the hand to a spectator face down, without any action', async () => {
        // Given
        await table('carol');
        const alice: SeventeenPokerSession = participant('alice');
        const bob: SeventeenPokerSession = participant('bob');
        alice.takeSeat(PokerSeat.ONE);
        bob.takeSeat(PokerSeat.TWO);
        await until(() => status() === 'bob to deal.');

        // Then
        expect(button('Deal')).toBeUndefined();
        expect(button('Sit here')).toBeUndefined();

        // When
        bob.deal();
        await until(() => status() === 'alice to speak.');
        alice.bet(BetAction.BET, 5);
        await until(() => status() === 'bob to speak.');

        // Then
        expect(cards(0)).toEqual(FACE_DOWN);
        expect(cards(1)).toEqual(FACE_DOWN);
        expect(text('#seat-bottom')).toEqual('alice140 chips');
        expect(text('#bet-bottom')).toEqual('Bet 5');
        expect(element().textContent).toContain('Spectators: 1');
        expect(button('Check')).toBeUndefined();
        expect(button('Call 5')).toBeUndefined();
    });

    test('should not move the chips of the history of the room to a participant joining late', async () => {
        // Given: a hand played to the showdown, which moves the chips once the cards are opened
        const alice: SeventeenPokerSession = participant('alice');
        const bob: SeventeenPokerSession = participant('bob');
        const turn = async (session: SeventeenPokerSession): Promise<void> => vi.waitFor(() => expect(session.myTurn()).toBe(true));
        alice.takeSeat(PokerSeat.ONE);
        bob.takeSeat(PokerSeat.TWO);
        bob.deal();
        await turn(alice);
        alice.bet(BetAction.BET, 5);
        await turn(bob);
        bob.bet(BetAction.CALL);
        await turn(alice);
        alice.exchange([]);
        await turn(bob);
        bob.exchange([]);
        await turn(alice);
        alice.bet(BetAction.CHECK);
        await turn(bob);
        bob.bet(BetAction.CHECK);
        await vi.waitFor(() => expect(alice.match().outcomes()).toHaveLength(1));

        // When: Carol joins, the chain giving her its history, the page showing the hands being opened
        await table('carol');
        const lastBet: number = hub.delivered.map((message: AppMessage) => message.type).lastIndexOf('SP_bet') + 1;
        hub.replay(fixture.componentInstance.room(), hub.delivered.slice(0, lastBet));
        await until(() => status() === 'The hands are shown…');
        hub.replay(fixture.componentInstance.room(), hub.delivered.slice(lastBet));
        await until(() => status() === 'alice to deal.');

        // Then
        expect(text('#hand-outcome')).not.toEqual('');
        expect(flights()).toEqual([]);

        // When
        alice.deal();
        await until(() => status() === 'bob to speak.');

        // Then: the antes of the next hand fly
        expect(flights()).toEqual([['5'], ['5']]);
    });

    test('should tell the player the deck waits for', async () => {
        // Given: the keys of Bob do not reach the chain once he shuffled
        let dropKeys: boolean = false;
        const bob: SeventeenPokerSession = await seated(SEVENTEEN_POKER_RULES, (message: AppMessage) => {
            return dropKeys && message.type === MentalDeckMessageType.KEYS ? { ...message, type: 'dropped' } : message;
        });

        // When: the shuffle of Bob waits, after his deal
        bob.deal();
        hub.hold('bob');

        // Then
        await until(() => status() === 'bob shuffles the deck…');
        expect(bob.deck()).not.toBeNull();

        // When
        dropKeys = true;
        hub.release();

        // Then
        await until(() => status() === 'Waiting for the keys of bob…');
    });

    test('should tell the hands are being shown', async () => {
        // Given
        let dropKeys: boolean = false;
        const bob: SeventeenPokerSession = await dealt(SEVENTEEN_POKER_RULES, (message: AppMessage) => {
            return dropKeys && message.type === MentalDeckMessageType.KEYS ? { ...message, type: 'dropped' } : message;
        });
        await click('Bet 1');
        await until(() => status() === 'bob to speak.');
        bob.bet(BetAction.CALL);
        await until(() => status() === 'Select the cards to discard, then exchange them.');
        await click('Keep my hand');
        await until(() => status() === 'bob exchanges cards.');
        bob.exchange([]);
        await until(() => status() === 'Your turn.');
        await click('Check');
        await until(() => status() === 'bob to speak.');

        // When: the keys of Bob opening the hands do not reach the chain
        dropKeys = true;
        bob.bet(BetAction.CHECK);

        // Then
        await until(() => status() === 'The hands are shown…');
    });

    test('should wait for a seated player who left the room', async () => {
        // Given: Alice deals the first hand, on the second seat
        await table('alice');
        participant('bob').takeSeat(PokerSeat.ONE);
        await fixture.whenStable();
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        await until(() => button('Deal') !== undefined);

        // When
        hub.leave(rooms.get('bob') as Room<PokerPayloads>);
        await until(() => status() === 'Waiting for bob to come back…');

        // Then
        expect(button('Deal')).toBeUndefined();
    });

    test('should tell the players read their cards once every key is in the chain', async () => {
        // Given: the deals of the table never resolve
        vi.spyOn(MentalDeck.prototype, 'deal').mockReturnValue(new Promise<void>(() => undefined));
        const bob: SeventeenPokerSession = await seated();

        // When
        bob.deal();

        // Then
        await until(() => status() === 'Reading the cards…');
    });

    test('should act once on a second click, or a click on a button hidden meanwhile', async () => {
        // Given
        const bob: SeventeenPokerSession = await dealt();

        // When: Alice checks twice
        const check: HTMLButtonElement = button('Check') as HTMLButtonElement;
        check.click();
        check.click();
        await until(() => status() === 'bob to speak.');
        bob.bet(BetAction.BET, 1);
        await until(() => status() === 'Your turn.');
        await click('Call 1');
        await until(() => status() === 'Select the cards to discard, then exchange them.');
        const keep: HTMLButtonElement = button('Keep my hand') as HTMLButtonElement;
        keep.click();
        keep.click();
        await until(() => status() === 'bob exchanges cards.');

        // Then
        expect(hub.delivered.filter((message: AppMessage) => message.type === 'SP_bet' && message.from === 'alice')).toHaveLength(2);
        expect(hub.delivered.filter((message: AppMessage) => message.type === 'SP_exchange')).toHaveLength(1);

        // When: Bob keeps his hand, Alice folds against his bet, then deals the next hand twice
        bob.exchange([]);
        await until(() => status() === 'Your turn.');
        await click('Check');
        await until(() => status() === 'bob to speak.');
        bob.bet(BetAction.BET, 1);
        await until(() => status() === 'Your turn.');
        await click('Fold');
        await until(() => status() === 'Your turn to deal.');
        const deal: HTMLButtonElement = button('Deal') as HTMLButtonElement;
        deal.click();
        deal.click();
        await until(() => status() === 'bob to speak.');

        // Then
        expect(hub.delivered.filter((message: AppMessage) => message.type === 'SP_deal' && message.from === 'alice')).toHaveLength(1);
        expect(hub.reports).toEqual([]);
    });

    test('should stop the match when a deck is cheated', async () => {
        // When: Bob locks the deck with cards not of the deck
        const bob: SeventeenPokerSession = await seated(SEVENTEEN_POKER_RULES, (message: AppMessage) => {
            return message.type === MentalDeckMessageType.LOCK ? { ...message, payload: { ...message.payload as object, cards: ['1'] } } : message;
        });
        bob.deal();

        // Then
        await until(() => status() === 'A deck was cheated: the match stops.');
        expect(button('Deal')).toBeUndefined();

        // When: Alice leaves her seat, then takes it again
        await click('Leave the seat');
        await until(() => status() === 'Waiting for two players to sit.');

        // Then: the note tells the cheat meanwhile
        expect(text('p.muted-note')).toEqual('A deck was cheated.');

        // When
        (element().querySelector('#seat-bottom button') as HTMLButtonElement).click();
        await until(() => button('Play again') !== undefined);

        // Then
        expect(status()).toEqual('A deck was cheated: the match stops.');
        expect(text('p.muted-note')).toEqual('');

        // When
        await click('Play again');
        await until(() => status() === 'bob to deal.');

        // Then
        expect(latestMatch()).toEqual('Match 1: Stopped: a deck was cheated.');
    });

    describe('end of the match', () => {
        const rules: PokerMatchRules = { ...SEVENTEEN_POKER_RULES, hands: 1 };

        test('should tell the winner, then the check of the decks', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt(rules);

            // When
            await click('Bet 1');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.FOLD);
            await until(() => text('.badge') !== '');

            // Then
            expect(text('.badge')).toEqual('alice wins the match with 155 chips.');
            expect(element().querySelector('.badge')?.classList).toContain('badge-win');
            expect(status()).toEqual('');
            expect(button('Deal')).toBeUndefined();
            expect(latestHand()).toEqual('Hand 1: bob folds, alice takes the pot of 11.');
            await until(() => text('p.muted-note') === 'Every deck was fair.');
        });

        test('should tell a draw', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt(rules);
            await landed();

            // When
            await click('Check');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.CHECK);
            await until(() => text('.badge') !== '');

            // Then: the antes go to the bank
            expect(flights()).toEqual([['5', '5']]);
            expect(text('.badge')).toEqual('Draw: both players end with 145 chips.');
            expect(element().querySelector('.badge')?.classList).toContain('badge-draw');
        });

        test('should play a new match once the match is over', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt(rules);
            await click('Bet 1');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.FOLD);
            await until(() => text('p.muted-note') === 'Every deck was fair.');
            await landed();

            // When: Alice asks for it twice
            const rematch: HTMLButtonElement = button('Play again') as HTMLButtonElement;
            rematch.click();
            rematch.click();
            await until(() => status() === 'bob to deal.');

            // Then: the new match starts from its own chips, without flights
            expect(hub.delivered.filter((message: AppMessage) => message.type === 'SP_rematch')).toHaveLength(1);
            expect(text('.badge')).toEqual('');
            expect(latestMatch()).toEqual('Match 1: alice wins the match with 155 chips. Every deck was fair.');
            expect(text('#seat-bottom')).toEqual('alice150 chipsLeave the seat');
            expect(text('#seat-top')).toEqual('bob150 chips');
            // No hand played in the new match
            expect(fixture.componentInstance.history()).toHaveLength(0);
            expect(cards(1)).toEqual([]);
            expect(flights()).toEqual([]);

            // When
            bob.deal();
            await until(() => status() === 'Your turn.');

            // Then
            expect(element().textContent).toContain('Hand 1 of 1');
            expect(flights()).toEqual([['5'], ['5']]);
            expect(button('Leave the seat')).toBeUndefined();
        });

        test('should open the seats once the match is over, the match keeping the names of its players', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt(rules);
            expect(button('Leave the seat')).toBeUndefined();
            await click('Check');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.BET, 1);
            await until(() => status() === 'Your turn.');
            await click('Fold');
            await until(() => button('Leave the seat') !== undefined);

            // When
            await click('Leave the seat');
            await until(() => status() === 'Waiting for two players to sit.');

            // Then
            expect(text('.badge')).toEqual('bob wins the match with 155 chips.');
            expect(latestHand()).toEqual('Hand 1: alice folds, bob takes the pot of 11.');
            expect(text('#seat-bottom')).toEqual('Free seatSit here');
            expect(text('#seat-top')).toEqual('bob155 chips +11');
            expect(cards(1)).toEqual([]);
            expect(cards(0)).toHaveLength(5);
            expect(button('Play again')).toBeUndefined();

            // When: Carol takes the seat of Alice
            participant('carol').takeSeat(PokerSeat.ONE);
            await until(() => text('#seat-bottom') !== 'Free seatSit here');

            // Then: she does not show the chips nor the cards of Alice, but the stack of the next match
            expect(text('#seat-bottom')).toEqual('carol150 chips');
            expect(cards(1)).toEqual([]);
            expect(text('.badge')).toEqual('bob wins the match with 155 chips.');
        });

        test('should let a player free the seat of the other one, away, while the seats are open', async () => {
            // Given
            await seated(rules);
            expect(button('Free the seat')).toBeUndefined();

            // When: Bob leaves the room
            hub.leave(rooms.get('bob') as Room<PokerPayloads>);
            await until(() => button('Free the seat') !== undefined);
            const release: HTMLButtonElement = button('Free the seat') as HTMLButtonElement;
            release.click();
            release.click();
            await until(() => status() === 'Waiting for two players to sit.');

            // Then
            expect(text('#seat-top')).toEqual('Free seat');
            expect(hub.types().filter((type: string) => type === SPGameSessionType.UNSEAT)).toHaveLength(1);
        });

        test('should tell the check of the decks of a former match on its line, once it ends', async () => {
            // Given: the check of the first match lasts until the next one started
            let check: (verification: DeckVerification) => void = () => undefined;
            const disclose = vi.spyOn(MentalDeck.prototype, 'disclose').mockReturnValue(new Promise<DeckVerification>((resolve) => check = resolve));
            const bob: SeventeenPokerSession = await dealt(rules);
            await click('Bet 1');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.FOLD);
            await until(() => text('p.muted-note') === 'Checking every deck…');
            disclose.mockRestore();

            // When
            await click('Play again');
            await until(() => status() === 'bob to deal.');

            // Then
            expect(latestMatch()).toEqual('Match 1: alice wins the match with 155 chips. Checking every deck…');

            // When
            check(DeckVerification.FAIR);

            // Then
            await until(() => latestMatch() === 'Match 1: alice wins the match with 155 chips. Every deck was fair.');
            expect(text('p.muted-note')).toEqual('');
        });

        test.each<{ verification: Promise<DeckVerification>; text: string }>([
            { verification: new Promise<DeckVerification>(() => undefined), text: 'Checking every deck…' },
            { verification: Promise.resolve(DeckVerification.CHEATED), text: 'A deck was cheated.' },
        ])('should tell the check of the decks: $text', async ({ verification, text: told }) => {
            // Given
            vi.spyOn(MentalDeck.prototype, 'disclose').mockReturnValue(verification);
            const bob: SeventeenPokerSession = await dealt(rules);

            // When
            await click('Check');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.CHECK);

            // Then
            await until(() => text('p.muted-note') === told);
        });
    });
});
