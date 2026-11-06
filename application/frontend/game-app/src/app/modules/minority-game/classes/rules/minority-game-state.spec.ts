import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { AskerDraw } from './asker';
import { MinorityEvent, MinorityEventKind, MinorityGameState, MinorityPhase, MissedReason, VoteOutcome } from './minority-game-state';
import { MINORITY_RULES, MinorityRules, MinorityVariant, Vote } from './minority-rules';
import { MinorityStanding } from './standings';
import { describe, expect, test } from 'vitest';

/** Three rounds in the score variant: the specs play a game to its end quickly */
const RULES: MinorityRules = { ...MINORITY_RULES, rounds: 3 };
const QUESTION = 'Will you vote yes?';
const { YES, NO } = Vote;

function game(players: number = 4, variant: MinorityVariant = MinorityVariant.ELIMINATION): MinorityGameState {
    return new MinorityGameState(RULES, players, { variant, voteTime: 30 }, 'seed');
}

/** The asker asks the question: the first candidate drawn, unless named */
function asked(minority: MinorityGameState, asker: number = (minority.askerDraw() as AskerDraw).candidates[0]): number {
    minority.appoint(asker);
    minority.askQuestion(asker, QUESTION);
    return asker;
}

/** Each player votes, undefined for no commitment: they commit in their order, then reveal */
function voted(minority: MinorityGameState, votes: ReadonlyArray<Vote | undefined>): void {
    votes.forEach((vote: Vote | undefined, player: number) => vote === undefined || minority.commitVote(player));
    votes.forEach((vote: Vote | undefined, player: number) => vote === undefined || minority.revealVote(player, vote));
}

/** A question asked, then voted */
function question(minority: MinorityGameState, votes: ReadonlyArray<Vote | undefined>, asker?: number): void {
    asked(minority, asker);
    voted(minority, votes);
}

const lastEvent = (minority: MinorityGameState): Readonly<MinorityEvent> => minority.events()[minority.events().length - 1];
const balances = (minority: MinorityGameState): Array<number | null> | undefined =>
    minority.result()?.standings.map((standing: Readonly<MinorityStanding>) => standing.balance);

describe('MinorityGameState', () => {
    test('should await nobody until the asker of the first question is drawn among every player', () => {
        // When
        const minority: MinorityGameState = game();

        // Then
        expect(minority.phase()).toEqual(MinorityPhase.ASKING);
        expect(minority.variant).toEqual(MinorityVariant.ELIMINATION);
        expect(minority.seed).toEqual('seed');
        expect([minority.round(), minority.ask(), minority.step()]).toEqual([0, 0, 0]);
        expect(minority.awaited()).toEqual([]);
        expect(minority.askerDraw()).toEqual({ round: 0, ask: 0, candidates: [0, 1, 2, 3] });
        expect(minority.alive()).toEqual([0, 1, 2, 3]);
        expect(minority.eliminated()).toEqual([]);
        expect(minority.scores()).toEqual([0, 0, 0, 0]);
        expect(minority.eliminatedAt()).toEqual([null, null, null, null]);
        expect(minority.phaseTime()).toEqual(RULES.questionTime);
        expect([minority.asker(), minority.question(), minority.result()]).toEqual([null, null, null]);
    });

    test('should appoint only a candidate of a pending draw, the phase going on', () => {
        // Given
        const minority: MinorityGameState = game();

        // When
        expect(minority.appoint(7)).toEqual(Applied.IGNORED);
        expect(minority.appoint(1)).toEqual(Applied.APPLIED);

        // Then
        expect(minority.asker()).toEqual(1);
        expect(minority.awaited()).toEqual([1]);
        expect(minority.askerDraw()).toBeNull();
        expect(minority.step()).toEqual(0);
        expect(minority.appoint(2)).toEqual(Applied.IGNORED);
    });

    test('should take the question of the asker only, then open the vote of every player still in', () => {
        // Given
        const minority: MinorityGameState = game();
        expect(minority.askQuestion(0, QUESTION)).toEqual(Applied.IGNORED);
        minority.appoint(1);

        // When
        expect(minority.askQuestion(0, QUESTION)).toEqual(Applied.ILLEGAL);
        expect(minority.askQuestion(1, QUESTION)).toEqual(Applied.APPLIED);

        // Then
        expect(minority.phase()).toEqual(MinorityPhase.VOTING);
        expect(minority.question()).toEqual(QUESTION);
        expect(minority.awaited()).toEqual([0, 1, 2, 3]);
        expect(minority.phaseTime()).toEqual(30);
        expect(minority.step()).toEqual(1);
        expect(minority.events()).toEqual([{ kind: MinorityEventKind.ASKED, round: 0, asker: 1, question: QUESTION }]);
        expect(minority.askQuestion(1, 'Again?')).toEqual(Applied.IGNORED);
    });

    test('should ignore the moves out of their phase, of no player, or sent again', () => {
        // Given
        const minority: MinorityGameState = game();

        // When
        expect(minority.commitVote(0)).toEqual(Applied.IGNORED);
        asked(minority);

        // Then
        expect(minority.revealVote(0, YES)).toEqual(Applied.IGNORED);
        expect(minority.commitVote(9)).toEqual(Applied.IGNORED);
        expect(minority.commitVote(1.5)).toEqual(Applied.IGNORED);
        expect(minority.commitVote(0)).toEqual(Applied.APPLIED);
        expect(minority.commitVote(0)).toEqual(Applied.IGNORED);
        minority.refuse(0);
        expect(minority.events()).toHaveLength(1);
        expect(minority.committed()).toEqual([0]);
    });

    test('should reveal once every voter committed, then count the votes in the order of the players', () => {
        // Given
        const minority: MinorityGameState = game(7);
        asked(minority, 4);

        // When
        [2, 0, 6, 3, 1, 5, 4].forEach((player: number) => minority.commitVote(player));

        // Then
        expect(minority.phase()).toEqual(MinorityPhase.REVEALING);
        expect(minority.committed()).toEqual([2, 0, 6, 3, 1, 5, 4]);
        expect(minority.phaseTime()).toEqual(RULES.revealTime);
        expect(minority.step()).toEqual(2);

        // When
        [[6, NO], [0, YES], [1, YES], [5, NO], [2, YES], [3, YES]].forEach(([player, vote]) => minority.revealVote(player as number, vote));

        // Then
        expect(minority.awaited()).toEqual([4]);
        expect(minority.revealVote(6, YES)).toEqual(Applied.IGNORED);

        // When
        expect(minority.revealVote(4, NO)).toEqual(Applied.APPLIED);

        // Then
        expect(lastEvent(minority)).toEqual({
            kind: MinorityEventKind.COUNTED, round: 0, asker: 4, question: QUESTION, outcome: VoteOutcome.MINORITY,
            votes: [[0, YES], [1, YES], [2, YES], [3, YES], [4, NO], [5, NO], [6, NO]].map(([player, vote]) => ({ player, vote })),
            eliminated: [0, 1, 2, 3], points: [],
        });
    });

    test('should close nothing once nothing is awaited', () => {
        // Given
        const minority: MinorityGameState = game();

        // When
        minority.close();

        // Then
        expect([minority.step(), minority.ask(), minority.events().length]).toEqual([0, 0, 0]);
    });

    describe('elimination', () => {
        test('should eliminate the majority side, asking a new question to the players left, never of the asker before', () => {
            // Given
            const minority: MinorityGameState = game(7);

            // When
            question(minority, [YES, YES, YES, YES, NO, NO, NO], 4);

            // Then
            expect(minority.alive()).toEqual([4, 5, 6]);
            expect(minority.eliminated()).toEqual([0, 1, 2, 3]);
            expect(minority.eliminatedAt()).toEqual([0, 0, 0, 0, null, null, null]);
            expect(minority.phase()).toEqual(MinorityPhase.ASKING);
            expect([minority.round(), minority.ask(), minority.step()]).toEqual([1, 0, 3]);
            expect(minority.askerDraw()).toEqual({ round: 1, ask: 0, candidates: [5, 6] });

            // When
            asked(minority, 5);

            // Then
            expect(minority.awaited()).toEqual([4, 5, 6]);
            expect(minority.commitVote(0)).toEqual(Applied.ILLEGAL);
        });

        test.each([
            [VoteOutcome.TIE, [YES, NO, NO, YES]],
            [VoteOutcome.UNANIMOUS, [NO, NO, NO, NO]],
        ])('should ask a new question, nobody eliminated, on a %s', (outcome: VoteOutcome, votes: ReadonlyArray<Vote>) => {
            // Given
            const minority: MinorityGameState = game();

            // When
            question(minority, votes, 2);

            // Then
            expect(lastEvent(minority)).toMatchObject({ kind: MinorityEventKind.COUNTED, outcome, eliminated: [] });
            expect(minority.alive()).toEqual([0, 1, 2, 3]);
            expect(minority.round()).toEqual(1);
            expect(minority.askerDraw()?.candidates).toEqual([0, 1, 3]);
        });

        test('should eliminate a player not voting in time', () => {
            // Given
            const minority: MinorityGameState = game(5);
            asked(minority, 0);
            [0, 1, 2, 3].forEach((player: number) => minority.commitVote(player));

            // When
            minority.close();

            // Then
            expect(lastEvent(minority)).toEqual({
                kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.VOTING, reason: MissedReason.LATE, players: [4],
            });
            expect(minority.phase()).toEqual(MinorityPhase.REVEALING);

            // When
            voted(minority, [YES, YES, NO, NO]);

            // Then
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.TIE, eliminated: [4] });
            expect(minority.alive()).toEqual([0, 1, 2, 3]);
        });

        test('should eliminate a vote withheld, not matching its commitment, or neither yes nor no', () => {
            // Given
            const minority: MinorityGameState = game(6);
            asked(minority, 0);
            [0, 1, 2, 3, 4, 5].forEach((player: number) => minority.commitVote(player));
            [YES, YES, NO].forEach((vote: Vote, player: number) => minority.revealVote(player, vote));

            // When
            minority.refuse(3);
            expect(minority.revealVote(4, 'maybe')).toEqual(Applied.ILLEGAL);
            minority.close();

            // Then
            expect(minority.events().slice(1, 4)).toEqual([
                { kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.INVALID, players: [3] },
                { kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.ILLEGAL, players: [4] },
                { kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.LATE, players: [5] },
            ]);
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [0, 1, 3, 4, 5] });
            expect(minority.phase()).toEqual(MinorityPhase.OVER);
            expect(minority.result()?.winners).toEqual([2]);
        });

        test('should count the votes revealed only: one side and players not voting is unanimous, the missing ones eliminated', () => {
            // Given
            const minority: MinorityGameState = game(5);
            asked(minority, 0);

            // When
            [0, 1, 2].forEach((player: number) => minority.commitVote(player));
            minority.close();
            voted(minority, [YES, YES, YES]);

            // Then
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.UNANIMOUS, eliminated: [3, 4] });
            expect(minority.alive()).toEqual([0, 1, 2]);
            expect(minority.phase()).toEqual(MinorityPhase.ASKING);
        });

        test('should eliminate every player left when no vote counts, the game over without winner', () => {
            // Given
            const minority: MinorityGameState = game(3);
            asked(minority, 1);

            // When
            minority.close();

            // Then
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.NO_VOTE, votes: [], eliminated: [0, 1, 2] });
            expect(minority.alive()).toEqual([]);
            expect(minority.phase()).toEqual(MinorityPhase.OVER);
            expect(minority.result()?.winners).toEqual([]);
            expect(balances(minority)).toEqual([-100, -100, -100]);
            expect(minority.awaited()).toEqual([]);
            expect(minority.phaseTime()).toEqual(RULES.revealTime);
        });

        test('should end the game of 3 players at its first vote neither unanimous nor void, its winner taking every stake', () => {
            // Given
            const minority: MinorityGameState = game(3);

            // When
            question(minority, [YES, YES, NO]);

            // Then
            expect(minority.phase()).toEqual(MinorityPhase.OVER);
            expect(minority.step()).toEqual(3);
            expect(minority.result()?.winners).toEqual([2]);
            expect(balances(minority)).toEqual([-100, -100, 200]);
        });

        test('should end with 2 winners sharing the stakes, the votes left tied', () => {
            // Given
            const minority: MinorityGameState = game(4);
            asked(minority, 0);

            // When
            [0, 1].forEach((player: number) => minority.commitVote(player));
            minority.close();
            voted(minority, [YES, NO]);

            // Then
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.TIE, eliminated: [2, 3] });
            expect(minority.result()?.winners).toEqual([0, 1]);
            expect(balances(minority)).toEqual([100, 100, -100, -100]);
        });

        test('should draw another asker once the time of the asker is over, nobody eliminated, the vote waiting for it still', () => {
            // Given
            const minority: MinorityGameState = game();
            minority.appoint(1);

            // When
            minority.close();

            // Then
            expect(lastEvent(minority)).toEqual({ kind: MinorityEventKind.ASKER_LATE, round: 0, asker: 1 });
            expect(minority.absent()).toEqual([1]);
            expect([minority.round(), minority.ask(), minority.step()]).toEqual([0, 1, 1]);
            expect(minority.askerDraw()).toEqual({ round: 0, ask: 1, candidates: [0, 2, 3] });

            // When
            asked(minority, 0);

            // Then
            expect(minority.awaited()).toEqual([0, 1, 2, 3]);
        });

        test('should draw among every player still in once all are absent, then end the game when that asker is late too', () => {
            // Given
            const minority: MinorityGameState = game(3);

            // When
            [0, 1, 2].forEach((player: number) => {
                minority.appoint(player);
                minority.close();
            });

            // Then
            expect(minority.absent()).toEqual([0, 1, 2]);
            expect(minority.askerDraw()).toEqual({ round: 0, ask: 3, candidates: [0, 1, 2] });

            // When nobody is there to ask
            minority.appoint(1);
            minority.close();

            // Then the question counts no vote: every player left is eliminated
            expect(lastEvent(minority)).toEqual({
                kind: MinorityEventKind.COUNTED, round: 0, asker: 1, question: '', votes: [], outcome: VoteOutcome.NO_VOTE, eliminated: [0, 1, 2], points: [],
            });
            expect(minority.phase()).toEqual(MinorityPhase.OVER);
            expect(minority.result()?.winners).toEqual([]);
            expect([minority.asker(), minority.question()]).toEqual([null, null]);
        });
    });

    describe('score', () => {
        test('should eliminate nobody, scoring each player of the minority side the votes of the majority side', () => {
            // Given
            const minority: MinorityGameState = game(5, MinorityVariant.SCORE);

            // When
            question(minority, [YES, YES, YES, NO, NO]);

            // Then
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [], points: [{ player: 3, points: 3 }, { player: 4, points: 3 }] });
            expect(minority.scores()).toEqual([0, 0, 0, 3, 3]);
            expect(minority.alive()).toEqual([0, 1, 2, 3, 4]);
            expect(minority.round()).toEqual(1);
        });

        test('should score nobody on a tie, a unanimous vote or no vote counted, each round counting', () => {
            // Given
            const minority: MinorityGameState = game(4, MinorityVariant.SCORE);

            // When
            question(minority, [YES, NO, YES, NO]);
            question(minority, [YES, YES, YES, YES]);
            asked(minority);
            minority.close();

            // Then
            expect(minority.events().filter((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.COUNTED)
                .map((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.COUNTED && [event.outcome, event.points]))
                .toEqual([[VoteOutcome.TIE, []], [VoteOutcome.UNANIMOUS, []], [VoteOutcome.NO_VOTE, []]]);
            expect(minority.phase()).toEqual(MinorityPhase.OVER);
            expect(minority.result()?.winners).toEqual([0, 1, 2, 3]);
        });

        test('should score 0 to a player not voting in time, absent from the draw of the askers, but awaited by the next vote', () => {
            // Given
            const minority: MinorityGameState = game(4, MinorityVariant.SCORE);
            asked(minority, 0);
            [0, 1, 2].forEach((player: number) => minority.commitVote(player));

            // When
            minority.close();
            voted(minority, [YES, YES, NO]);

            // Then
            expect(minority.scores()).toEqual([0, 0, 2, 0]);
            expect(minority.absent()).toEqual([3]);
            expect(minority.askerDraw()?.candidates).toEqual([1, 2]);

            // When
            asked(minority, 1);

            // Then
            expect(minority.awaited()).toEqual([0, 1, 2, 3]);
            expect(minority.commitVote(3)).toEqual(Applied.APPLIED);
            expect(minority.absent()).toEqual([]);
            expect(minority.gone()).toEqual([]);
        });

        test('should keep a player absent once, missing a vote again, its miss told once, and score it 0 again', () => {
            // Given player 3 absent, missing the first vote
            const minority: MinorityGameState = game(4, MinorityVariant.SCORE);
            asked(minority, 0);
            [0, 1, 2].forEach((player: number) => minority.commitVote(player));
            minority.close();
            voted(minority, [YES, YES, NO]);
            asked(minority, 1);
            [0, 1, 2].forEach((player: number) => minority.commitVote(player));

            // When
            minority.close();
            voted(minority, [NO, YES, YES]);

            // Then
            expect(minority.absent()).toEqual([3]);
            expect(minority.gone()).toEqual([3]);
            expect(minority.scores()).toEqual([2, 0, 2, 0]);
            expect(minority.events().filter((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.MISSED)
                .map((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.MISSED && [event.round, event.players]))
                .toEqual([[0, [3]]]);
        });

        test('should tell a vote missed by a player absent since it asked late, or revealed late', () => {
            // Given player 3 late to ask
            const minority: MinorityGameState = game(4, MinorityVariant.SCORE);
            minority.appoint(3);
            minority.close();
            asked(minority, 0);
            [0, 1, 2].forEach((player: number) => minority.commitVote(player));

            // When
            minority.close();
            voted(minority, [YES, YES, NO]);

            // Then
            expect(minority.absent()).toEqual([3]);
            expect(minority.gone()).toEqual([3]);

            // Given player 2 late to reveal
            asked(minority, 1);
            [0, 1, 2, 3].forEach((player: number) => minority.commitVote(player));
            [0, 1, 3].forEach((player: number) => minority.revealVote(player, YES));
            minority.close();
            asked(minority, 0);
            [0, 1, 3].forEach((player: number) => minority.commitVote(player));

            // When
            minority.close();

            // Then
            expect(minority.events().filter((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.MISSED)
                .map((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.MISSED && [event.round, event.phase, event.players]))
                .toEqual([[0, MinorityPhase.VOTING, [3]], [1, MinorityPhase.REVEALING, [2]], [2, MinorityPhase.VOTING, [2]]]);
            expect(minority.gone()).toEqual([2]);
        });

        test('should draw the asker of the question before again when no other player is present', () => {
            // Given
            const minority: MinorityGameState = game(3, MinorityVariant.SCORE);
            asked(minority, 0);
            minority.commitVote(0);

            // When
            minority.close();
            minority.revealVote(0, YES);

            // Then
            expect(minority.absent()).toEqual([1, 2]);
            expect(minority.askerDraw()?.candidates).toEqual([0]);
        });

        test('should take the most a question gives off a vote withheld, not matching or neither yes nor no, in a tie too', () => {
            // Given
            const minority: MinorityGameState = game(5, MinorityVariant.SCORE);
            asked(minority, 0);
            [0, 1, 2, 3, 4].forEach((player: number) => minority.commitVote(player));

            // When
            minority.revealVote(0, YES);
            minority.revealVote(1, NO);
            minority.refuse(2);
            minority.revealVote(3, 'maybe');
            minority.close();

            // Then
            expect(lastEvent(minority)).toMatchObject({
                outcome: VoteOutcome.TIE,
                points: [{ player: 2, points: -4 }, { player: 3, points: -4 }, { player: 4, points: -4 }],
            });
            expect(minority.scores()).toEqual([0, 0, -4, -4, -4]);
        });

        test('should not count the question of an asker late as a round, but when every player is absent', () => {
            // Given
            const minority: MinorityGameState = game(3, MinorityVariant.SCORE);
            minority.appoint(2);

            // When
            minority.close();

            // Then
            expect([minority.round(), minority.ask()]).toEqual([0, 1]);

            // When the two others are late too, then the asker drawn among every player
            [0, 1, 2].forEach((player: number) => {
                minority.appoint(player);
                minority.close();
            });

            // Then the round is over, nobody scoring
            expect([minority.round(), minority.ask(), minority.phase()]).toEqual([1, 0, MinorityPhase.ASKING]);
            expect(lastEvent(minority)).toMatchObject({ outcome: VoteOutcome.NO_VOTE, points: [] });
            expect(minority.scores()).toEqual([0, 0, 0]);
        });

        test('should end after its rounds, the highest total winning, equal totals sharing the place', () => {
            // Given
            const minority: MinorityGameState = game(3, MinorityVariant.SCORE);

            // When
            question(minority, [YES, YES, NO]);
            question(minority, [YES, NO, NO]);
            question(minority, [YES, YES, YES]);

            // Then
            expect(minority.phase()).toEqual(MinorityPhase.OVER);
            expect(minority.scores()).toEqual([2, 0, 2]);
            expect(minority.result()?.winners).toEqual([0, 2]);
            expect(minority.result()?.standings.map((standing: Readonly<MinorityStanding>) => standing.place)).toEqual([1, 3, 1]);
        });
    });
});
