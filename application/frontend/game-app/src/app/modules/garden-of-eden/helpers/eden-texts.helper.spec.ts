import { translated } from '@testing/translatable-text.helper';
import { describe, expect, test } from 'vitest';
import { AppleOutcome, CastApple } from '../classes/rules/apple-count';
import { EdenEvent, EdenEventKind, EdenPhase, MissedReason } from '../classes/rules/eden-game-state';
import { Apple, EDEN_RULES } from '../classes/rules/eden-rules';
import { clockText, eventText } from './eden-texts.helper';

const NAMES: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];
const { GOLD, SILVER, RED } = Apple;
const apples = (...cast: ReadonlyArray<Apple>): ReadonlyArray<CastApple> => cast.map((apple: Apple, player: number) => ({ player, apple }));
const counted = (change: Partial<Extract<EdenEvent, { kind: EdenEventKind.COUNTED }>>): EdenEvent => ({
    kind: EdenEventKind.COUNTED, round: 2, votes: apples(RED, RED, RED), outcome: AppleOutcome.ALL_RED, lone: null, color: null, gains: [], ...change,
});
const missed = (phase: EdenPhase, reason: MissedReason, players: ReadonlyArray<number>, amount: number): EdenEvent =>
    ({ kind: EdenEventKind.MISSED, round: 0, phase, reason, players, amount });

describe('eventText', () => {
    test.each<[EdenEvent, string]>([
        [counted({}), 'Round 3: 0 gold, 0 silver, 3 red. Only red apples: each one wins 100 million'],
        [counted({ votes: apples(GOLD, RED, SILVER), outcome: AppleOutcome.LONE_RED, lone: 1 }),
            'Round 3: 1 gold, 1 silver, 1 red. bob alone picked red and loses 1,000 million, the other apples win 100 million'],
        [counted({ votes: apples(RED, SILVER, RED), outcome: AppleOutcome.LONE_APPLE, lone: 1 }),
            'Round 3: 0 gold, 1 silver, 2 red. The lone silver apple of bob wins 200 million, the red ones lose 100 million'],
        [counted({ votes: apples(RED, GOLD, RED, SILVER), outcome: AppleOutcome.MIXED }),
            'Round 3: 1 gold, 1 silver, 2 red. The red apples lose 100 million, the gold and silver ones win 100 million'],
        [counted({ votes: apples(GOLD, GOLD, SILVER), outcome: AppleOutcome.MAJORITY, color: GOLD }),
            'Round 3: 2 gold, 1 silver, 0 red. The gold apples win 100 million, the others lose 100 million'],
        [counted({ votes: apples(SILVER, SILVER), outcome: AppleOutcome.ONE_COLOR, color: SILVER }),
            'Round 3: 0 gold, 2 silver, 0 red. Only silver apples: each one loses 100 million'],
        [counted({ votes: apples(GOLD, SILVER), outcome: AppleOutcome.TIE }), 'Round 3: 1 gold, 1 silver, 0 red. As many gold as silver apples: none wins or loses'],
        [counted({ votes: [], outcome: AppleOutcome.NO_VOTE }), 'Round 3: no apple counted'],
        [missed(EdenPhase.VOTING, MissedReason.LATE, [1, 3], 100), 'bob, dave: no apple in time, −100 million'],
        [missed(EdenPhase.REVEALING, MissedReason.LATE, [3], 1000), 'dave: apple not revealed in time, −1,000 million'],
        [missed(EdenPhase.REVEALING, MissedReason.INVALID, [2], 1000), 'carol: apple revealed otherwise than sealed, −1,000 million'],
        [missed(EdenPhase.REVEALING, MissedReason.ILLEGAL, [0], 1000), 'alice: something else than an apple revealed, −1,000 million'],
        [{ kind: EdenEventKind.OUT, round: 4, players: [0] }, 'Round 5: alice loses paradise'],
        [{ kind: EdenEventKind.OUT, round: 4, players: [0, 2] }, 'Round 5: alice, carol lose paradise'],
    ])('should tell %o', (event: EdenEvent, text: string) => {
        expect(translated(eventText(event, NAMES, EDEN_RULES))).toEqual(text);
    });
});

describe('clockText', () => {
    test.each([[300, '5:00'], [65, '1:05'], [4, '0:04']])('should tell %i seconds in minutes and seconds', (seconds: number, text: string) => {
        expect(translated(clockText(seconds))).toEqual(text);
    });
});
