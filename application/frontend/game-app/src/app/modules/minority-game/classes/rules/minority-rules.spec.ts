import { isSetup, isVariant, isVote, MINORITY_RULES, MinorityVariant, Vote } from './minority-rules';
import { describe, expect, test } from 'vitest';

describe('MinorityRules', () => {
    test('should offer vote times longer than the watch of the censorship, the default among them', () => {
        // Then
        expect(MINORITY_RULES.voteTimes.every((time: number) => time > 10)).toBe(true);
        expect(MINORITY_RULES.voteTimes).toContain(MINORITY_RULES.defaultVoteTime);
        expect([MINORITY_RULES.drawTime, MINORITY_RULES.questionTime, MINORITY_RULES.revealTime].every((time: number) => time > 10)).toBe(true);
    });

    test.each([
        [MinorityVariant.ELIMINATION, true],
        [MinorityVariant.SCORE, true],
        ['knockout', false],
        [undefined, false],
    ])('should tell whether %s is a variant', (value: unknown, variant: boolean) => {
        // Then
        expect(isVariant(value)).toBe(variant);
    });

    test.each([
        [Vote.YES, true],
        [Vote.NO, true],
        ['maybe', false],
        [1, false],
    ])('should tell whether %s is a vote', (value: unknown, vote: boolean) => {
        // Then
        expect(isVote(value)).toBe(vote);
    });

    test.each([
        [{ variant: MinorityVariant.SCORE, voteTime: 30 }, true],
        [{ variant: MinorityVariant.ELIMINATION, voteTime: 300 }, true],
        [{ variant: MinorityVariant.SCORE, voteTime: 45 }, false],
        [{ variant: MinorityVariant.SCORE, voteTime: '30' }, false],
        [{ variant: 'knockout', voteTime: 30 }, false],
    ])('should accept the setup %o only with a variant and a vote time offered', (setup: { variant: unknown; voteTime: unknown }, offered: boolean) => {
        // Then
        expect(isSetup(MINORITY_RULES, setup)).toBe(offered);
    });
});
