import {
    CallKind, CONTRABAND_RULES, ContrabandVariant, isCall, isSetup, isTrunk, isVariant, Team, teamOf, trunkLimit,
} from './contraband-rules';
import { describe, expect, test } from 'vitest';

const { CLASSIC, GOLD_RUSH } = ContrabandVariant;

describe('ContrabandRules', () => {
    test('should offer phase times longer than the watch of the censorship, the defaults among the options, even game counts', () => {
        // Then
        expect([CONTRABAND_RULES.drawTime, CONTRABAND_RULES.packingTime, CONTRABAND_RULES.revealTime, ...CONTRABAND_RULES.customsTimes]
            .every((time: number) => time > 10)).toBe(true);
        expect(CONTRABAND_RULES.customsTimes).toContain(CONTRABAND_RULES.defaultCustomsTime);
        expect(CONTRABAND_RULES.gameCounts).toContain(CONTRABAND_RULES.defaultGames);
        expect(CONTRABAND_RULES.gameCounts.every((games: number) => games % 2 === 0)).toBe(true);
        expect(CONTRABAND_RULES.atm + CONTRABAND_RULES.account).toEqual(CONTRABAND_RULES.debt);
    });

    test.each([
        [CLASSIC, true],
        [GOLD_RUSH, true],
        ['silver', false],
        [undefined, false],
    ])('should tell whether %s is a variant', (value: unknown, variant: boolean) => {
        // Then
        expect(isVariant(value)).toBe(variant);
    });

    test.each([
        [{ variant: CLASSIC, customsTime: 120, games: 10 }, true],
        [{ variant: GOLD_RUSH, customsTime: 60, games: 30 }, true],
        [{ variant: CLASSIC, customsTime: 90, games: 10 }, false],
        [{ variant: CLASSIC, customsTime: '120', games: 10 }, false],
        [{ variant: CLASSIC, customsTime: 120, games: 12 }, false],
        [{ variant: 'silver', customsTime: 120, games: 10 }, false],
    ])('should accept the setup %o only with a variant, a customs time and a game count offered', (
        setup: { variant: unknown; customsTime: unknown; games: unknown }, offered: boolean,
    ) => {
        // Then
        expect(isSetup(CONTRABAND_RULES, setup)).toBe(offered);
    });

    test.each([
        [CLASSIC, { kind: CallKind.PASS }, true],
        [CLASSIC, { kind: CallKind.DOUBT, amount: 1 }, true],
        [CLASSIC, { kind: CallKind.DOUBT, amount: 100 }, true],
        [CLASSIC, { kind: CallKind.DOUBT, amount: 0 }, false],
        [CLASSIC, { kind: CallKind.DOUBT, amount: 101 }, false],
        [CLASSIC, { kind: CallKind.DOUBT, amount: 2.5 }, false],
        [CLASSIC, { kind: CallKind.DOUBT, amount: '50' }, false],
        [CLASSIC, { kind: CallKind.DOUBT }, false],
        [CLASSIC, { kind: CallKind.PASS, amount: 50 }, false],
        [CLASSIC, { kind: CallKind.CHECK }, false],
        [GOLD_RUSH, { kind: CallKind.PASS }, true],
        [GOLD_RUSH, { kind: CallKind.CHECK }, true],
        [GOLD_RUSH, { kind: CallKind.CHECK, amount: 100 }, false],
        [GOLD_RUSH, { kind: CallKind.DOUBT, amount: 50 }, false],
        [CLASSIC, { kind: 'bribe' }, false],
        [CLASSIC, null, false],
        [CLASSIC, 'pass', false],
        [CLASSIC, undefined, false],
    ])('should tell whether a call of the %s variant is %o', (variant: ContrabandVariant, value: unknown, call: boolean) => {
        // Then
        expect(isCall(CONTRABAND_RULES, variant, value)).toBe(call);
    });

    test.each([
        [300, 100],
        [100, 100],
        [40, 40],
        [0, 0],
    ])('should limit the trunk out of an ATM of %i to %i', (atm: number, limit: number) => {
        // Then
        expect(trunkLimit(CONTRABAND_RULES, atm)).toEqual(limit);
    });

    test.each([
        [CLASSIC, 300, 0, true],
        [CLASSIC, 300, 100, true],
        [CLASSIC, 300, 101, false],
        [CLASSIC, 40, 40, true],
        [CLASSIC, 40, 41, false],
        [CLASSIC, 0, 0, true],
        [CLASSIC, 300, -1, false],
        [CLASSIC, 300, 2.5, false],
        [CLASSIC, 300, '40', false],
        [GOLD_RUSH, 300, 100, true],
        [GOLD_RUSH, 300, 0, true],
        [GOLD_RUSH, 300, 50, false],
        [GOLD_RUSH, 0, 100, false],
        [GOLD_RUSH, 0, 0, true],
        [GOLD_RUSH, 300, '100', false],
    ])('should tell whether a %s trunk out of an ATM of %i may hold %o', (variant: ContrabandVariant, atm: number, value: unknown, trunk: boolean) => {
        // Then
        expect(isTrunk(CONTRABAND_RULES, variant, atm, value)).toBe(trunk);
    });

    test('should put the first players in the North, the others in the South', () => {
        // Then
        expect([0, 1, 2, 3, 4, 5].map((player: number) => teamOf(player, 3)))
            .toEqual([Team.NORTH, Team.NORTH, Team.NORTH, Team.SOUTH, Team.SOUTH, Team.SOUTH]);
    });
});
