import { AppleCount, AppleOutcome, CastApple, countApples } from './apple-count';
import { Apple, EDEN_RULES } from './eden-rules';
import { describe, expect, test } from 'vitest';

const { GOLD, SILVER, RED } = Apple;
/** The players of the apples are not contiguous: the gains keep their indexes */
const PLAYERS: ReadonlyArray<number> = [0, 2, 5, 6, 7];
const cast = (apples: ReadonlyArray<Apple>): CastApple[] => apples.map((apple: Apple, index: number) => ({ player: PLAYERS[index], apple }));

describe('countApples', () => {
    test.each<[ReadonlyArray<Apple>, AppleOutcome, ReadonlyArray<number>, number | null, Apple | null]>([
        [[], AppleOutcome.NO_VOTE, [], null, null],
        [[GOLD, SILVER], AppleOutcome.TIE, [0, 0], null, null],
        [[GOLD, SILVER, SILVER, GOLD], AppleOutcome.TIE, [0, 0, 0, 0], null, null],
        [[GOLD], AppleOutcome.ONE_COLOR, [-100], null, GOLD],
        [[SILVER, SILVER], AppleOutcome.ONE_COLOR, [-100, -100], null, SILVER],
        [[GOLD, GOLD, SILVER], AppleOutcome.MAJORITY, [100, 100, -100], null, GOLD],
        [[SILVER, GOLD, SILVER], AppleOutcome.MAJORITY, [100, -100, 100], null, SILVER],
        [[RED], AppleOutcome.ALL_RED, [100], null, null],
        [[RED, RED, RED], AppleOutcome.ALL_RED, [100, 100, 100], null, null],
        [[RED, GOLD], AppleOutcome.LONE_RED, [-1000, 100], 0, null],
        [[GOLD, RED, SILVER, GOLD], AppleOutcome.LONE_RED, [100, -1000, 100, 100], 2, null],
        [[RED, RED, SILVER], AppleOutcome.LONE_APPLE, [-100, -100, 200], 5, null],
        [[RED, GOLD, RED, RED], AppleOutcome.LONE_APPLE, [-100, 200, -100, -100], 2, null],
        [[RED, GOLD, RED, SILVER], AppleOutcome.MIXED, [-100, 100, -100, 100], null, null],
        [[RED, GOLD, RED, SILVER, RED], AppleOutcome.MIXED, [-100, 100, -100, 100, -100], null, null],
    ])('should count %o as %s', (apples: ReadonlyArray<Apple>, outcome: AppleOutcome, gains: ReadonlyArray<number>, lone: number | null, color: Apple | null) => {
        // When
        const count: AppleCount = countApples(EDEN_RULES, cast(apples));

        // Then
        expect(count.outcome).toEqual(outcome);
        expect(count.gains).toEqual(gains.map((gain: number, index: number) => ({ player: PLAYERS[index], gain })));
        expect([count.lone, count.color]).toEqual([lone, color]);
    });
});
