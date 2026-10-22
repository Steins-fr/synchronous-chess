import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { DeckVerification, MentalDeck } from '@app/modules/mental-poker/classes/mental-deck';
import { SraCipher } from '@app/modules/mental-poker/classes/sra-cipher';
import { MentalDeckMessageType } from '@app/modules/mental-poker/mental-deck-messages';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { TEST_GROUP } from '@testing/sra-test-group';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PokerPayloads, SeventeenPokerSession } from '../../classes/game-sessions/seventeen-poker-session';
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
        TestBed.configureTestingModule({ providers: [{ provide: POKER_SESSION_OPTIONS, useValue: { cipher, rules } }] });
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
    const status = (): string => text('[role="status"]');
    const button = (label: string): HTMLButtonElement | undefined => Array.from(element().querySelectorAll<HTMLButtonElement>('button'))
        .find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label);
    /** The names of the cards of a hand, from the top of the table */
    const cards = (index: number): string[] => Array.from(
        element().querySelectorAll('app-card-hand')[index].querySelectorAll('[role="img"]'),
        (image: Element) => image.getAttribute('aria-label') as string,
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

    test('should seat the participants on the free seats', async () => {
        // Given
        await table('alice');
        const bob: SeventeenPokerSession = participant('bob');

        // Then
        expect(status()).toEqual('Waiting for two players to sit.');
        expect(text('#seat-top')).toEqual('Free seatSit here');
        expect(text('#seat-bottom')).toEqual('Free seatSit here');

        // When: Alice sits on the second seat, at the top of the table, then at its bottom
        (element().querySelector('#seat-top button') as HTMLButtonElement).click();
        bob.takeSeat(PokerSeat.ONE);
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

        // Then: Bob sits at the bottom of the table of a spectator
        expect(text('#seat-bottom')).toEqual('bob150 chips');
        expect(text('#seat-top')).toEqual('Free seatSit here');
    });

    test('should deal the hand, the cards of the player only face up', async () => {
        // When
        await dealt();

        // Then
        expect(cards(1)).not.toContain('Face-down card');
        expect(cards(0)).toEqual(FACE_DOWN);
        expect(text('app-card-deck span')).toEqual('7');
        expect(element().textContent).toContain('Pot 10');
        expect(element().textContent).toContain('Hand 1 of 10');
        expect(text('#seat-bottom')).toEqual('alice145 chips');
        expect(element().querySelector('#seat-bottom .seat')?.classList).toContain('acting');
        expect(button('Check')).toBeDefined();
        expect(button('Fold')).toBeUndefined();
    });

    test('should set the amount of a bet within its bounds', async () => {
        // Given
        await dealt();

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
    });

    test('should play a hand to the showdown', async () => {
        // Given
        const bob: SeventeenPokerSession = await dealt();

        // When: Alice bets, Bob raises
        await click('Bet more');
        await click('Bet 6');
        await until(() => status() === 'bob to speak.');

        // Then
        expect(text('#seat-bottom')).toEqual('alice139 chips Bet 6');
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
        await click('Call 6');
        await until(() => status() === 'Select the cards to discard, then exchange them.');
        const kept: string[] = cards(1).slice(2);
        const hand: HTMLButtonElement[] = Array.from(element().querySelectorAll('app-card-hand')[1].querySelectorAll('button'));
        expect(button('Keep my hand')).toBeDefined();
        hand[0].click();
        hand[1].click();
        await fixture.whenStable();

        // Then
        expect(button('Exchange 2 cards')).toBeDefined();

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

        // Then: both hands are shown, the best one outlined
        const outcome = bob.match.hand()?.outcome;
        expect(outcome?.end).toEqual(HandEnd.SHOWDOWN);
        expect(cards(0)).not.toContain('Face-down card');
        expect(cards(1).slice(2)).toEqual(kept);
        expect(element().textContent).toContain('Pot 0');
        expect(text('details li')).toMatch(/^Hand 1: /);
        const outlined = (index: number): boolean => Array.from(element().querySelectorAll('app-card-hand')[index].querySelectorAll('[role="img"]'))
            .every((image: Element) => image.classList.contains('outline-3'));
        expect(outlined(1)).toEqual(outcome?.winner === PokerSeat.ONE);
        expect(outlined(0)).toEqual(outcome?.winner === PokerSeat.TWO);
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
        await click('Fold');
        await until(() => status() === 'Your turn to deal.');

        // Then
        expect(text('details li')).toEqual('Hand 1: alice folds, bob takes the pot of 17.');
        expect(text('#seat-bottom')).toEqual('alice142 chips');
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
        expect(text('#seat-bottom')).toEqual('alice140 chips Bet 5');
        expect(element().textContent).toContain('Spectators: 1');
        expect(button('Check')).toBeUndefined();
        expect(button('Call 5')).toBeUndefined();
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
        (element().querySelector('#seat-top button') as HTMLButtonElement).click();
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
            expect(element().querySelector('[role="status"]')).toBeNull();
            expect(button('Deal')).toBeUndefined();
            expect(text('details li')).toEqual('Hand 1: bob folds, alice takes the pot of 11.');
            await until(() => text('p.muted-note') === 'Every deck was fair.');
        });

        test('should tell a draw', async () => {
            // Given
            const bob: SeventeenPokerSession = await dealt(rules);

            // When
            await click('Check');
            await until(() => status() === 'bob to speak.');
            bob.bet(BetAction.CHECK);
            await until(() => text('.badge') !== '');

            // Then
            expect(text('.badge')).toEqual('Draw: both players end with 145 chips.');
            expect(element().querySelector('.badge')?.classList).toContain('badge-draw');
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
