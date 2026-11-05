import { Call, CallKind, CONTRABAND_RULES, ContrabandVariant } from './contraband-rules';
import { CustomsOutcome, Movement, settleCall, withheldMovement } from './customs';
import { describe, expect, test } from 'vitest';

const { PASSED, EMPTY_DOUBT, SEIZED, SLIPPED, IRON_CHECKED, WITHHELD } = CustomsOutcome;
const PASS: Call = { kind: CallKind.PASS };
const CHECK: Call = { kind: CallKind.CHECK };
const doubt = (amount: number): Call => ({ kind: CallKind.DOUBT, amount });
/** The outcome, smuggled, seized, indemnity, from the ATM */
type Summary = [CustomsOutcome, number, number, number, number];
const summary = (movement: Movement): Summary =>
    [movement.outcome, movement.smuggled, movement.seized, movement.indemnity, movement.fromAtm];

describe('settleCall', () => {
    test.each<[string, number, Call, Summary]>([
        ['a pass lets the contents through', 40, PASS, [PASSED, 40, 0, 0, 40]],
        ['a pass on an empty trunk moves nothing', 0, PASS, [PASSED, 0, 0, 0, 0]],
        ['a doubt on an empty trunk pays half of it', 0, doubt(30), [EMPTY_DOUBT, 0, 0, 15, 0]],
        ['a doubt of an odd amount on an empty trunk pays a half', 0, doubt(7), [EMPTY_DOUBT, 0, 0, 3.5, 0]],
        ['a doubt of 1 on an empty trunk pays a half million', 0, doubt(1), [EMPTY_DOUBT, 0, 0, 0.5, 0]],
        ['a doubt of the contents seizes them', 40, doubt(40), [SEIZED, 0, 40, 0, 40]],
        ['a doubt over the contents seizes them only', 40, doubt(100), [SEIZED, 0, 40, 0, 40]],
        ['a doubt of 1 seizes 1', 1, doubt(1), [SEIZED, 0, 1, 0, 1]],
        ['a doubt of the contents minus 1 lets them through, paying half of it', 40, doubt(39), [SLIPPED, 40, 0, 19.5, 40]],
        ['a doubt under the contents lets them through, paying half of it', 100, doubt(10), [SLIPPED, 100, 0, 5, 100]],
        ['a pass on a gold bar lets it through', 100, PASS, [PASSED, 100, 0, 0, 100]],
        ['a pass on an iron bar moves nothing', 0, PASS, [PASSED, 0, 0, 0, 0]],
        ['a check of a gold bar seizes it', 100, CHECK, [SEIZED, 0, 100, 0, 100]],
        ['a check of an iron bar pays a gold bar', 0, CHECK, [IRON_CHECKED, 0, 0, 100, 0]],
    ])('should settle the call: %s', (_: string, contents: number, call: Call, movement: Summary) => {
        // Then
        expect(summary(settleCall(CONTRABAND_RULES, contents, call))).toEqual(movement);
    });
});

describe('withheldMovement', () => {
    test.each([
        [ContrabandVariant.CLASSIC, 300, 100],
        [ContrabandVariant.CLASSIC, 100, 100],
        [ContrabandVariant.CLASSIC, 40, 40],
        [ContrabandVariant.CLASSIC, 0, 0],
        [ContrabandVariant.GOLD_RUSH, 300, 100],
        [ContrabandVariant.GOLD_RUSH, 100, 100],
        [ContrabandVariant.GOLD_RUSH, 0, 0],
    ])('should seize the most a %s trunk holds out of an ATM of %i: %i', (variant: ContrabandVariant, atm: number, seized: number) => {
        // Then
        expect(summary(withheldMovement(CONTRABAND_RULES, variant, atm))).toEqual([WITHHELD, 0, seized, 0, seized]);
    });
});
