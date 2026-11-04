import { translated } from '@testing/translatable-text.helper';
import { describe, expect, test } from 'vitest';
import { MinorityEvent, MinorityEventKind, MinorityPhase, MissedReason, VoteOutcome } from '../classes/rules/minority-game-state';
import { MinorityVariant, Vote } from '../classes/rules/minority-rules';
import { clockText, eventText, Mask } from './minority-texts.helper';

const NAMES: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];
const { YES, NO } = Vote;
const shouting: Mask = (text: string) => text.toUpperCase();
const votes = (...cast: ReadonlyArray<Vote>): ReadonlyArray<{ player: number; vote: Vote }> => cast.map((vote: Vote, player: number) => ({ player, vote }));
const counted = (change: Partial<Extract<MinorityEvent, { kind: MinorityEventKind.COUNTED }>>): MinorityEvent => ({
    kind: MinorityEventKind.COUNTED, round: 2, asker: 0, question: 'Rain?', votes: votes(YES, YES, NO), outcome: VoteOutcome.MINORITY,
    eliminated: [], points: [], ...change,
});

describe('eventText', () => {
    test.each<[MinorityEvent, MinorityVariant, string]>([
        [{ kind: MinorityEventKind.ASKED, round: 0, asker: 1, question: 'Do you like rain?' }, MinorityVariant.ELIMINATION,
            'Question 1, asked by bob: “DO YOU LIKE RAIN?”'],
        [{ kind: MinorityEventKind.ASKER_LATE, round: 1, asker: 2 }, MinorityVariant.SCORE, 'Question 2: carol did not ask in time, another player asks'],
        [{ kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.VOTING, reason: MissedReason.LATE, players: [1, 3] }, MinorityVariant.ELIMINATION,
            'bob, dave: no vote in time'],
        [{ kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.LATE, players: [3] }, MinorityVariant.SCORE,
            'dave: vote not revealed in time'],
        [{ kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.INVALID, players: [2] }, MinorityVariant.SCORE,
            'carol: vote revealed otherwise than sealed'],
        [{ kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.ILLEGAL, players: [0] }, MinorityVariant.SCORE,
            'alice: a vote neither yes nor no'],
        [counted({ eliminated: [0, 1, 3] }), MinorityVariant.ELIMINATION, 'Question 3: 2 yes, 1 no. Eliminated: alice, bob, dave'],
        [counted({ votes: votes(YES, NO), outcome: VoteOutcome.TIE }), MinorityVariant.ELIMINATION, 'Question 3: 1 yes, 1 no. Nobody eliminated: a new question'],
        [counted({ points: [{ player: 2, points: 2 }, { player: 3, points: -3 }] }), MinorityVariant.SCORE, 'Round 3: 2 yes, 1 no. Points: carol +2, dave -3'],
        [counted({ votes: [], outcome: VoteOutcome.NO_VOTE }), MinorityVariant.SCORE, 'Round 3: 0 yes, 0 no. Nobody scores'],
    ])('should tell %o in the %s variant', (event: MinorityEvent, variant: MinorityVariant, text: string) => {
        expect(translated(eventText(event, NAMES, variant, shouting))).toEqual(text);
    });
});

describe('clockText', () => {
    test.each([[300, '5:00'], [65, '1:05'], [4, '0:04']])('should tell %i seconds in minutes and seconds', (seconds: number, text: string) => {
        expect(translated(clockText(seconds))).toEqual(text);
    });
});
