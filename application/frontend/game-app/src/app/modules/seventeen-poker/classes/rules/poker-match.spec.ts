import { cards } from '@testing/playing-cards.helper';
import { BetAction } from './betting-round';
import { HandCategory } from './hand-evaluator';
import { DRAW_PILE, HandEnd, HandPhase, PokerHand, PokerMatch, PokerMatchRules, SEVENTEEN_POKER_RULES } from './poker-match';
import { PokerSeat } from './poker-seat';
import { describe, expect, test } from 'vitest';

const { ONE, TWO } = PokerSeat;

/** The match once both players bet 10 chips in the first round of its first hand */
function exchanging(): PokerMatch {
    const match: PokerMatch = new PokerMatch();
    match.startHand();
    match.bet(ONE, BetAction.BET, 10);
    match.bet(TWO, BetAction.CALL);
    return match;
}

/** The match at the showdown of its first hand, both players having bet 10 chips then 30 */
function atShowdown(): PokerMatch {
    const match: PokerMatch = exchanging();
    match.exchange(ONE, 0);
    match.exchange(TWO, 0);
    match.bet(ONE, BetAction.BET, 30);
    match.bet(TWO, BetAction.CALL);
    return match;
}

describe('PokerMatch', () => {
    test('should start with the stacks of the rules and no hand', () => {
        // When
        const match: PokerMatch = new PokerMatch();

        // Then
        expect(match.rules).toEqual(SEVENTEEN_POKER_RULES);
        expect(match.stacks()).toEqual([150, 150]);
        expect(match.hand()).toBeNull();
        expect(match.outcomes()).toEqual([]);
        expect(match.result()).toBeNull();
        expect(match.exchanging()).toBeNull();
        expect(match.drawPile()).toEqual(DRAW_PILE);
        expect(DRAW_PILE).toEqual(7);
    });

    test('should start a hand with the antes of both players, the first player speaking first', () => {
        // Given
        const match: PokerMatch = new PokerMatch();

        // When
        const started: boolean = match.startHand();

        // Then
        const hand: PokerHand = match.hand() as PokerHand;
        expect(started).toBe(true);
        expect(match.stacks()).toEqual([145, 145]);
        expect(hand.index).toEqual(0);
        expect(hand.first).toEqual(ONE);
        expect(hand.phase).toEqual(HandPhase.FIRST_ROUND);
        expect(hand.pot).toEqual(10);
        expect(hand.cap).toEqual(145);
        expect(hand.round.limits).toEqual({ min: 1, max: 145 });
        expect(hand.round.toAct).toEqual(ONE);
        expect(match.startHand()).toBe(false);
    });

    test('should end the hand as a no contest when both players check in the first round, the antes going to the bank', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        match.startHand();

        // When
        match.bet(ONE, BetAction.CHECK);
        match.bet(TWO, BetAction.CHECK);

        // Then
        expect(match.stacks()).toEqual([145, 145]);
        expect(match.hand()?.phase).toEqual(HandPhase.OVER);
        expect(match.outcomes()).toEqual([{ end: HandEnd.NO_CONTEST, winner: null, pot: 10, gains: [0, 0], hands: null }]);
    });

    test('should give the pot to the other player when a player folds', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        match.startHand();

        // When
        match.bet(ONE, BetAction.BET, 10);
        match.bet(TWO, BetAction.RAISE, 25);
        match.bet(ONE, BetAction.FOLD);

        // Then
        expect(match.stacks()).toEqual([135, 165]);
        expect(match.hand()?.outcome).toEqual({ end: HandEnd.FOLD, winner: TWO, pot: 45, gains: [0, 45], hands: null });
    });

    test('should take the bets out of the stacks into the pot', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        match.startHand();

        // When
        match.bet(ONE, BetAction.BET, 10);

        // Then
        expect(match.stacks()).toEqual([135, 145]);
        expect(match.hand()?.pot).toEqual(20);
        expect(match.hand()?.phase).toEqual(HandPhase.FIRST_ROUND);
    });

    test('should exchange after a call, the first player first, the second limited to the cards left', () => {
        // Given
        const match: PokerMatch = exchanging();

        // Then
        expect(match.hand()?.phase).toEqual(HandPhase.EXCHANGE);
        expect(match.hand()?.firstRoundBet).toEqual(10);
        expect(match.exchanging()).toEqual(ONE);
        expect(match.exchange(TWO, 1)).toBe(false);

        // When
        expect(match.exchange(ONE, 5)).toBe(true);

        // Then
        expect(match.exchanging()).toEqual(TWO);
        expect(match.drawPile()).toEqual(2);
        expect(match.exchange(TWO, 3)).toBe(false);

        // When
        expect(match.exchange(TWO, 2)).toBe(true);

        // Then
        expect(match.hand()?.exchanges).toEqual([5, 2]);
        expect(match.drawPile()).toEqual(0);
        expect(match.exchanging()).toBeNull();
        expect(match.hand()?.phase).toEqual(HandPhase.SECOND_ROUND);
        expect(match.hand()?.round.limits).toEqual({ min: 10, max: 30 });
        expect(match.hand()?.round.toAct).toEqual(ONE);
    });

    test.each([-1, 1.5, 6])('should refuse an exchange of %s cards', (count: number) => {
        // Then
        expect(exchanging().exchange(ONE, count)).toBe(false);
    });

    test('should go to the showdown once the second round is called', () => {
        // When
        const match: PokerMatch = atShowdown();

        // Then
        expect(match.hand()?.phase).toEqual(HandPhase.SHOWDOWN);
        expect(match.hand()?.pot).toEqual(90);
        expect(match.stacks()).toEqual([105, 105]);
    });

    test('should go to the showdown when both players check in the second round', () => {
        // Given
        const match: PokerMatch = exchanging();
        match.exchange(ONE, 1);
        match.exchange(TWO, 1);

        // When
        match.bet(ONE, BetAction.CHECK);
        match.bet(TWO, BetAction.CHECK);

        // Then
        expect(match.hand()?.phase).toEqual(HandPhase.SHOWDOWN);
        expect(match.hand()?.pot).toEqual(30);
    });

    test.each<{ name: string; hands: [string, string]; winner: PokerSeat }>([
        { name: 'the first player', hands: ['KS KH KD QC QS', 'AS AH AD JC KC'], winner: ONE },
        { name: 'the second player', hands: ['KS KH QD QC JS', 'AS AH AD JC *'], winner: TWO },
    ])('should give the pot to the best hand at the showdown, of $name', ({ hands, winner }) => {
        // Given
        const match: PokerMatch = atShowdown();

        // When
        const shown: boolean = match.showdown([cards(hands[0]), cards(hands[1])]);

        // Then
        expect(shown).toBe(true);
        expect(match.hand()?.phase).toEqual(HandPhase.OVER);
        expect(match.hand()?.outcome?.end).toEqual(HandEnd.SHOWDOWN);
        expect(match.hand()?.outcome?.winner).toEqual(winner);
        expect(match.stacks()[winner]).toEqual(195);
        expect(match.hand()?.outcome?.hands?.map((hand) => hand.category)).toHaveLength(2);
    });

    test('should split the pot of equal hands', () => {
        // Given
        const match: PokerMatch = atShowdown();

        // When
        match.showdown([cards('KS KH QD QC AS'), cards('KD KC QS QH AH')]);

        // Then
        expect(match.stacks()).toEqual([150, 150]);
        expect(match.hand()?.outcome).toMatchObject({ winner: null, gains: [45, 45] });
        expect(match.hand()?.outcome?.hands?.[0].category).toEqual(HandCategory.TWO_PAIR);
    });

    test('should refuse the actions out of their phase', () => {
        // Given
        const match: PokerMatch = new PokerMatch();

        // Then
        expect(match.bet(ONE, BetAction.CHECK)).toBe(false);
        expect(match.exchange(ONE, 0)).toBe(false);
        expect(match.showdown([[], []])).toBe(false);
        expect(exchanging().bet(ONE, BetAction.CHECK)).toBe(false);
        expect(atShowdown().bet(ONE, BetAction.CHECK)).toBe(false);
        expect(atShowdown().exchange(ONE, 0)).toBe(false);
    });

    test('should refuse an illegal bet, changing nothing', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        match.startHand();

        // When
        const bet: boolean = match.bet(TWO, BetAction.BET, 10);

        // Then
        expect(bet).toBe(false);
        expect(match.stacks()).toEqual([145, 145]);
        expect(match.hand()?.pot).toEqual(10);
    });

    test('should let the other player speak first in the next hand', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        expect(match.dealer()).toEqual(TWO);
        match.startHand();
        match.bet(ONE, BetAction.FOLD);
        expect(match.dealer()).toEqual(ONE);

        // When
        match.startHand();

        // Then
        expect(match.hand()?.index).toEqual(1);
        expect(match.hand()?.first).toEqual(TWO);
        expect(match.hand()?.round.toAct).toEqual(TWO);
    });

    test('should keep the second round to the first bet when it is above the most of the rules', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        match.startHand();
        match.bet(ONE, BetAction.BET, 40);
        match.bet(TWO, BetAction.CALL);
        match.exchange(ONE, 0);

        // When
        match.exchange(TWO, 0);

        // Then
        expect(match.hand()?.round.limits).toEqual({ min: 40, max: 40 });
    });

    test('should cap the bets of a hand by the stack of the poorer player', () => {
        // Given: the first player loses a hand of 130 chips
        const match: PokerMatch = new PokerMatch();
        match.startHand();
        match.bet(ONE, BetAction.BET, 130);
        match.bet(TWO, BetAction.CALL);
        match.exchange(ONE, 0);
        match.exchange(TWO, 0);
        match.bet(ONE, BetAction.CHECK);
        match.bet(TWO, BetAction.CHECK);
        match.showdown([cards('KS KH QD QC AS'), cards('AD AH AC JC JS')]);

        // When
        match.startHand();

        // Then
        expect(match.stacks()).toEqual([10, 280]);
        expect(match.hand()?.cap).toEqual(10);
        expect(match.hand()?.round.limits).toEqual({ min: 1, max: 10 });
    });

    test('should leave no bet to the second round once the first one reached the cap', () => {
        // Given
        const match: PokerMatch = new PokerMatch();
        match.startHand();
        match.bet(ONE, BetAction.BET, 145);
        match.bet(TWO, BetAction.CALL);
        match.exchange(ONE, 0);

        // When
        match.exchange(TWO, 0);

        // Then
        expect(match.hand()?.round.limits.max).toEqual(0);
        expect(match.hand()?.round.legalActions()).toEqual([BetAction.CHECK, BetAction.FOLD]);
    });

    test('should play the hand to the showdown when a player paid the ante with its last chips', () => {
        // Given
        const match: PokerMatch = new PokerMatch({ ...SEVENTEEN_POKER_RULES, stack: 5 });
        match.startHand();

        // When
        match.bet(ONE, BetAction.CHECK);
        match.bet(TWO, BetAction.CHECK);
        match.exchange(ONE, 2);
        match.exchange(TWO, 0);

        // Then
        expect(match.hand()?.firstRoundBet).toEqual(0);
        expect(match.hand()?.round.legalActions()).toEqual([BetAction.CHECK, BetAction.FOLD]);

        // When
        match.bet(ONE, BetAction.CHECK);
        match.bet(TWO, BetAction.CHECK);
        match.showdown([cards('AS AH AD AC JS'), cards('KS KH KD KC JH')]);

        // Then
        expect(match.result()).toEqual({ winner: ONE, stacks: [10, 0] });
    });

    test.each<{ name: string; rules: Partial<PokerMatchRules> }>([
        { name: 'no hand', rules: { hands: 0 } },
        { name: 'stacks below the ante', rules: { stack: 3 } },
    ])('should play no hand in a match of $name', ({ rules }) => {
        // Given
        const match: PokerMatch = new PokerMatch({ ...SEVENTEEN_POKER_RULES, ...rules });

        // When
        const started: boolean = match.startHand();

        // Then
        expect(started).toBe(false);
        expect(match.hand()).toBeNull();
        expect(match.result()?.winner).toBeNull();
    });

    test('should end the match after its hands, the stacks equal giving no winner', () => {
        // Given
        const match: PokerMatch = new PokerMatch({ ...SEVENTEEN_POKER_RULES, hands: 2 });

        // When
        for (let hand: number = 0; hand < 2; hand++) {
            expect(match.result()).toBeNull();
            match.startHand();
            expect(match.result()).toBeNull();
            match.bet(match.hand()?.first as PokerSeat, BetAction.CHECK);
            match.bet(match.hand()?.round.toAct as PokerSeat, BetAction.CHECK);
        }

        // Then
        expect(match.result()).toEqual({ winner: null, stacks: [140, 140] });
        expect(match.startHand()).toBe(false);
    });

    test('should end the match once a player can not pay the ante, the other winning', () => {
        // Given
        const match: PokerMatch = new PokerMatch({ ...SEVENTEEN_POKER_RULES, stack: 10 });
        match.startHand();

        // When
        match.bet(ONE, BetAction.BET, 5);
        match.bet(TWO, BetAction.CALL);
        match.exchange(ONE, 0);
        match.exchange(TWO, 0);
        match.bet(ONE, BetAction.CHECK);
        match.bet(TWO, BetAction.CHECK);
        match.showdown([cards('KS KH QD QC AS'), cards('AD AH AC JC JS')]);

        // Then
        expect(match.result()).toEqual({ winner: TWO, stacks: [0, 20] });
        expect(match.startHand()).toBe(false);
    });

    test('should give the win to the first player with the most chips', () => {
        // Given
        const match: PokerMatch = new PokerMatch({ ...SEVENTEEN_POKER_RULES, hands: 1 });
        match.startHand();

        // When
        match.bet(ONE, BetAction.BET, 1);
        match.bet(TWO, BetAction.FOLD);

        // Then
        expect(match.result()).toEqual({ winner: ONE, stacks: [155, 145] });
    });
});
