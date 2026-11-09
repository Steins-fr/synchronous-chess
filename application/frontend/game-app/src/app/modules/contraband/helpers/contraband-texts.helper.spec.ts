import { translated } from '@testing/translatable-text.helper';
import { describe, expect, test } from 'vitest';
import { ContrabandEventKind, WithheldReason } from '../classes/rules/contraband-game-state';
import { Call, CallKind, ContrabandVariant } from '../classes/rules/contraband-rules';
import { CustomsOutcome, Movement } from '../classes/rules/customs';
import { clockText, CrossingEvent, eventText, SettledEvent, trunkText } from './contraband-texts.helper';

const NAMES: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];
const PASS: Call = { kind: CallKind.PASS };
const CHECK: Call = { kind: CallKind.CHECK };
const doubt = (amount: number): Call => ({ kind: CallKind.DOUBT, amount });
const moved = (outcome: CustomsOutcome, smuggled: number, seized: number, indemnity: number): Movement =>
    ({ outcome, smuggled, seized, indemnity, fromAtm: smuggled + seized });
const settled = (call: Call, contents: number | null, movement: Movement, reason: WithheldReason | null = null, lateCall: boolean = false): SettledEvent =>
    ({ kind: ContrabandEventKind.SETTLED, crossing: 2, smuggler: 1, inspector: 3, call, lateCall, contents, movement, reason });

describe('eventText', () => {
    test.each<[CrossingEvent, string]>([
        [{ kind: ContrabandEventKind.PACK_LATE, crossing: 0, smuggler: 0, inspector: 2 }, 'Game 1: alice packs no trunk in time, nothing moves'],
        [settled(PASS, 40, moved(CustomsOutcome.PASSED, 40, 0, 0)), 'Game 3: dave lets bob pass, 40 million smuggled'],
        [settled(PASS, 40, moved(CustomsOutcome.PASSED, 40, 0, 0), null, true), 'Game 3: dave does not call in time and lets bob pass, 40 million smuggled'],
        [settled(doubt(7), 0, moved(CustomsOutcome.EMPTY_DOUBT, 0, 0, 3.5)), 'Game 3: dave doubts 7 million of an empty trunk, and pays bob 3.5 million'],
        [settled(doubt(50), 40, moved(CustomsOutcome.SEIZED, 0, 40, 0)), 'Game 3: dave doubts 50 million and seizes 40 million from bob'],
        [settled(CHECK, 100, moved(CustomsOutcome.SEIZED, 0, 100, 0)), 'Game 3: dave checks and seizes 100 million from bob'],
        [settled(doubt(30), 40, moved(CustomsOutcome.SLIPPED, 40, 0, 15)), 'Game 3: dave doubts 30 million, bob smuggles 40 million and receives 15 million'],
        [settled(CHECK, 0, moved(CustomsOutcome.IRON_CHECKED, 0, 0, 100)), 'Game 3: dave checks an iron bar, and pays bob 100 million'],
        [settled(PASS, null, moved(CustomsOutcome.WITHHELD, 0, 100, 0), WithheldReason.LATE), 'Game 3: the trunk of bob is not revealed in time, dave seizes 100 million'],
        [settled(PASS, null, moved(CustomsOutcome.WITHHELD, 0, 40, 0), WithheldReason.INVALID), 'Game 3: the trunk of bob is revealed otherwise than sealed, dave seizes 40 million'],
        [settled(PASS, null, moved(CustomsOutcome.WITHHELD, 0, 0, 0), WithheldReason.ILLEGAL), 'Game 3: the trunk of bob breaks the rules, dave seizes 0 million'],
    ])('should tell %o', (event: CrossingEvent, text: string) => {
        expect(translated(eventText(event, NAMES))).toEqual(text);
    });
});

describe('trunkText', () => {
    test.each<[number | null, ContrabandVariant, string]>([
        [40, ContrabandVariant.CLASSIC, '40 million'],
        [0, ContrabandVariant.CLASSIC, 'Empty'],
        [100, ContrabandVariant.GOLD_RUSH, 'Gold bar'],
        [0, ContrabandVariant.GOLD_RUSH, 'Iron bar'],
        [null, ContrabandVariant.CLASSIC, 'Not revealed'],
    ])('should tell a trunk holding %o in the %s variant', (contents: number | null, variant: ContrabandVariant, text: string) => {
        expect(translated(trunkText(settled(PASS, contents, moved(CustomsOutcome.PASSED, contents ?? 0, 0, 0)), variant))).toEqual(text);
    });
});

describe('clockText', () => {
    test.each([[300, '5:00'], [65, '1:05'], [4, '0:04']])('should tell %i seconds in minutes and seconds', (seconds: number, text: string) => {
        expect(translated(clockText(seconds))).toEqual(text);
    });
});
