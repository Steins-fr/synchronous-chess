import {
    Bets, BetError, betError, coveredPockets, croupierOf, FIXED_ROULETTE_RULES, isBets, isCroupierBet, isPocket, isPunterBet, isSetup,
    punterMinimum, Side, sideOf, totalOf,
} from './fixed-roulette-rules';
import { describe, expect, test } from 'vitest';

const { CROUPIER, PUNTER } = Side;

describe('FixedRouletteRules', () => {
    test('should offer phase times longer than the watch of the censorship, the default among the offers, an even match', () => {
        // Then
        expect([FIXED_ROULETTE_RULES.drawTime, FIXED_ROULETTE_RULES.revealTime, ...FIXED_ROULETTE_RULES.betTimes].every((time: number) => time > 10)).toBe(true);
        expect(FIXED_ROULETTE_RULES.betTimes).toContain(FIXED_ROULETTE_RULES.defaultBetTime);
        expect(FIXED_ROULETTE_RULES.games % 2).toEqual(0);
        expect(FIXED_ROULETTE_RULES.punterPockets).toBeLessThan(FIXED_ROULETTE_RULES.pockets);
    });

    test.each([
        [{ betTime: 30 }, true],
        [{ betTime: 300 }, true],
        [{ betTime: 45 }, false],
        [{ betTime: '60' }, false],
        [{ betTime: undefined }, false],
    ])('should accept the setup %o only with a bet time offered', (setup: { betTime: unknown }, offered: boolean) => {
        // Then
        expect(isSetup(FIXED_ROULETTE_RULES, setup)).toBe(offered);
    });

    test.each([
        [1, true],
        [4, true],
        [0, false],
        [5, false],
        [2.5, false],
        ['2', false],
        [null, false],
    ])('should tell whether %o is a pocket of the wheel', (value: unknown, pocket: boolean) => {
        // Then
        expect(isPocket(FIXED_ROULETTE_RULES, value)).toBe(pocket);
    });

    test.each([
        [[0, 15, 50, 0], true],
        [[0, 0, 0, 0], true],
        [[0, 15, 50], false],
        [[0, 15, 50, 0, 0], false],
        [[0, -1, 50, 0], false],
        [[0, 1.5, 50, 0], false],
        [[0, '15', 50, 0], false],
        [[0, null, 50, 0], false],
        [{ 0: 15 }, false],
        ['15', false],
        [null, false],
    ])('should tell whether %o has the shape of bets', (value: unknown, bets: boolean) => {
        // Then
        expect(isBets(FIXED_ROULETTE_RULES, value)).toBe(bets);
    });

    test('should total the chips of the bets and tell the pockets covered, the first pocket numbered 1', () => {
        // Then
        expect(totalOf([0, 15, 50, 0])).toEqual(65);
        expect(totalOf([0, 0, 0, 0])).toEqual(0);
        expect(coveredPockets([0, 15, 50, 0])).toEqual([2, 3]);
        expect(coveredPockets([1, 0, 0, 7])).toEqual([1, 4]);
        expect(coveredPockets([0, 0, 0, 0])).toEqual([]);
    });

    test.each([
        [500, 65, 65],
        [40, 65, 40],
        [65, 65, 65],
    ])('should ask a punter holding %i chips for %i chips at least after a croupier betting %i', (chips: number, croupierTotal: number, minimum: number) => {
        // Then
        expect(punterMinimum(chips, croupierTotal)).toEqual(minimum);
    });

    test.each<[Side, number, number, Bets, BetError | null]>([
        [CROUPIER, 500, 0, [0, 15, 50, 0], null],
        [CROUPIER, 500, 0, [1, 1, 1, 1], null],
        [CROUPIER, 500, 0, [500, 0, 0, 0], null],
        [CROUPIER, 500, 0, [0, 0, 0, 0], BetError.NONE],
        [CROUPIER, 500, 0, [250, 251, 0, 0], BetError.OVER],
        [CROUPIER, 40, 0, [0, 0, 0, 41], BetError.OVER],
        [PUNTER, 500, 65, [0, 35, 0, 30], null],
        [PUNTER, 500, 65, [0, 0, 0, 100], null],
        [PUNTER, 500, 65, [0, 35, 0, 29], BetError.UNDER],
        [PUNTER, 500, 65, [0, 0, 0, 0], BetError.UNDER],
        [PUNTER, 500, 65, [10, 35, 0, 30], BetError.POCKETS],
        [PUNTER, 500, 65, [500, 1, 0, 0], BetError.OVER],
        [PUNTER, 40, 65, [0, 40, 0, 0], null],
        [PUNTER, 40, 65, [20, 0, 20, 0], null],
        [PUNTER, 40, 65, [0, 39, 0, 0], BetError.ALL_IN],
        [PUNTER, 40, 65, [0, 0, 0, 0], BetError.ALL_IN],
        [PUNTER, 40, 65, [10, 10, 20, 0], BetError.POCKETS],
        [PUNTER, 0, 0, [0, 0, 0, 0], BetError.NONE],
    ])('should check the bets of the %s holding %i chips after a croupier betting %i: %o', (
        side: Side, chips: number, croupierTotal: number, bets: Bets, error: BetError | null,
    ) => {
        // Then
        expect(betError(FIXED_ROULETTE_RULES, side, chips, croupierTotal, bets)).toEqual(error);
    });

    test('should accept the bets received with their shape and the rules of their side', () => {
        // Then
        expect(isCroupierBet(FIXED_ROULETTE_RULES, 500, [0, 15, 50, 0])).toBe(true);
        expect(isCroupierBet(FIXED_ROULETTE_RULES, 500, [0, 0, 0, 0])).toBe(false);
        expect(isCroupierBet(FIXED_ROULETTE_RULES, 500, [0, 15, 50])).toBe(false);
        expect(isPunterBet(FIXED_ROULETTE_RULES, 500, 65, [0, 35, 0, 30])).toBe(true);
        expect(isPunterBet(FIXED_ROULETTE_RULES, 500, 65, [0, 35, 0, 29])).toBe(false);
        expect(isPunterBet(FIXED_ROULETTE_RULES, 500, 65, 'all in')).toBe(false);
    });

    test('should swap the croupier each game, from the one drawn, and tell the side of each player', () => {
        // Then
        expect([0, 1, 2, 3, 9].map((round: number) => croupierOf(round, 0))).toEqual([0, 1, 0, 1, 1]);
        expect([0, 1, 2, 3, 9].map((round: number) => croupierOf(round, 1))).toEqual([1, 0, 1, 0, 0]);
        expect([sideOf(0, 0), sideOf(1, 0), sideOf(0, 1), sideOf(1, 1)]).toEqual([CROUPIER, PUNTER, PUNTER, CROUPIER]);
    });
});
