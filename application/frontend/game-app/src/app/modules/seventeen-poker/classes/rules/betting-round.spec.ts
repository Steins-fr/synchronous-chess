import { BetAction, BettingRound, RoundEnd } from './betting-round';
import { PokerSeat } from './poker-seat';
import { describe, expect, test } from 'vitest';

const { ONE, TWO } = PokerSeat;

describe('BettingRound', () => {
    const open = (): BettingRound => BettingRound.open(ONE, { min: 10, max: 30 });

    test('should open on the player speaking first, who checks, bets or folds', () => {
        // When
        const round: BettingRound = open();

        // Then
        expect(round.toAct).toEqual(ONE);
        expect(round.bets).toEqual([0, 0]);
        expect(round.end).toBeNull();
        expect(round.legalActions()).toEqual([BetAction.CHECK, BetAction.BET, BetAction.FOLD]);
        expect(round.betRange()).toEqual({ min: 10, max: 30 });
    });

    test('should end once both players checked', () => {
        // When
        const checked: BettingRound = open().act(ONE, BetAction.CHECK) as BettingRound;
        const round: BettingRound = checked.act(TWO, BetAction.CHECK) as BettingRound;

        // Then
        expect(checked.toAct).toEqual(TWO);
        expect(checked.end).toBeNull();
        expect(round.toAct).toBeNull();
        expect(round.end).toEqual(RoundEnd.CHECKED);
        expect(round.legalActions()).toEqual([]);
        expect(round.betRange()).toBeNull();
        expect(round.act(ONE, BetAction.CHECK)).toBeNull();
    });

    test('should let the other player call, raise or fold after a bet', () => {
        // When
        const round: BettingRound = open().act(ONE, BetAction.BET, 15) as BettingRound;

        // Then
        expect(round.bets).toEqual([15, 0]);
        expect(round.highest).toEqual(15);
        expect(round.toAct).toEqual(TWO);
        expect(round.legalActions()).toEqual([BetAction.CALL, BetAction.RAISE, BetAction.FOLD]);
        expect(round.betRange()).toEqual({ min: 25, max: 30 });
        expect(round.act(TWO, BetAction.CHECK)).toBeNull();
        expect(round.act(TWO, BetAction.BET, 25)).toBeNull();
    });

    test('should end on a call, the bets matched', () => {
        // When
        const round: BettingRound = (open().act(ONE, BetAction.BET, 10) as BettingRound).act(TWO, BetAction.CALL) as BettingRound;

        // Then
        expect(round.bets).toEqual([10, 10]);
        expect(round.end).toEqual(RoundEnd.CALLED);
        expect(round.folder).toBeNull();
    });

    test('should raise up to the most of the round, then call or fold only', () => {
        // When
        const raised: BettingRound = (open().act(ONE, BetAction.BET, 10) as BettingRound).act(TWO, BetAction.RAISE, 20) as BettingRound;
        const reraised: BettingRound = raised.act(ONE, BetAction.RAISE, 30) as BettingRound;
        const round: BettingRound = reraised.act(TWO, BetAction.CALL) as BettingRound;

        // Then
        expect(raised.bets).toEqual([10, 20]);
        expect(raised.toAct).toEqual(ONE);
        expect(raised.betRange()).toEqual({ min: 30, max: 30 });
        expect(reraised.legalActions()).toEqual([BetAction.CALL, BetAction.FOLD]);
        expect(reraised.betRange()).toBeNull();
        expect(round.bets).toEqual([30, 30]);
        expect(round.end).toEqual(RoundEnd.CALLED);
    });

    test('should raise to the most of the round when a whole raise is above it', () => {
        // When
        const round: BettingRound = open().act(ONE, BetAction.BET, 25) as BettingRound;

        // Then
        expect(round.betRange()).toEqual({ min: 30, max: 30 });
        expect(round.act(TWO, BetAction.RAISE, 30)?.bets).toEqual([25, 30]);
    });

    test('should end on a fold, telling who folded', () => {
        // When
        const round: BettingRound = (open().act(ONE, BetAction.BET, 10) as BettingRound).act(TWO, BetAction.FOLD) as BettingRound;

        // Then
        expect(round.end).toEqual(RoundEnd.FOLDED);
        expect(round.folder).toEqual(TWO);
        expect(round.toAct).toBeNull();
        expect(round.bets).toEqual([10, 0]);
    });

    test.each<{ name: string; amount: number | undefined }>([
        { name: 'no amount', amount: undefined },
        { name: 'a part of a chip', amount: 12.5 },
        { name: 'less than the least bet', amount: 9 },
        { name: 'more than the most of the round', amount: 31 },
    ])('should refuse a bet of $name', ({ amount }) => {
        // Then
        expect(open().act(ONE, BetAction.BET, amount)).toBeNull();
    });

    test('should refuse the action of the player not to speak', () => {
        // Then
        expect(open().act(TWO, BetAction.CHECK)).toBeNull();
    });

    test('should let a player check or fold only when it can bet nothing', () => {
        // When
        const round: BettingRound = BettingRound.open(TWO, { min: 1, max: 0 });

        // Then
        expect(round.legalActions()).toEqual([BetAction.CHECK, BetAction.FOLD]);
        expect(round.betRange()).toBeNull();
        expect(round.act(TWO, BetAction.BET, 1)).toBeNull();
    });
});
