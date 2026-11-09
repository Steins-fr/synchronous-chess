import { Apple, EDEN_RULES, isApple, isSetup } from './eden-rules';
import { describe, expect, test } from 'vitest';

describe('EdenRules', () => {
    test('should offer vote times longer than the watch of the censorship, the defaults among the offers', () => {
        // Then
        expect(EDEN_RULES.voteTimes.every((time: number) => time > 10)).toBe(true);
        expect([EDEN_RULES.drawTime, EDEN_RULES.revealTime].every((time: number) => time > 10)).toBe(true);
        expect(EDEN_RULES.voteTimes).toContain(EDEN_RULES.defaultVoteTime);
        expect(EDEN_RULES.startMoneys).toContain(EDEN_RULES.defaultStartMoney);
    });

    test('should make withholding an apple cost as much as a lone red apple, below the floor of paradise from no money', () => {
        // Then
        expect(EDEN_RULES.withheldPenalty).toEqual(EDEN_RULES.loneRedLoss);
        expect(-EDEN_RULES.loneRedLoss).toBeLessThanOrEqual(EDEN_RULES.paradiseFloor);
        expect(EDEN_RULES.paradiseFloor).toBeLessThan(0);
    });

    test.each([
        [Apple.GOLD, true],
        [Apple.SILVER, true],
        [Apple.RED, true],
        ['green', false],
        [undefined, false],
    ])('should tell whether %s is an apple', (value: unknown, apple: boolean) => {
        // Then
        expect(isApple(value)).toBe(apple);
    });

    test.each([
        [{ voteTime: 30, startMoney: 0 }, true],
        [{ voteTime: 300, startMoney: 1000 }, true],
        [{ voteTime: 45, startMoney: 0 }, false],
        [{ voteTime: '30', startMoney: 0 }, false],
        [{ voteTime: 30, startMoney: 250 }, false],
        [{ voteTime: 30, startMoney: '500' }, false],
        [{ voteTime: 30, startMoney: undefined }, false],
    ])('should accept the setup %o only with a vote time and a starting money offered', (setup: { voteTime: unknown; startMoney: unknown }, offered: boolean) => {
        // Then
        expect(isSetup(EDEN_RULES, setup)).toBe(offered);
    });
});
