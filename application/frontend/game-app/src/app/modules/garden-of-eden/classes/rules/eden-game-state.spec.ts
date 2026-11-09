import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { AppleOutcome } from './apple-count';
import { EdenEvent, EdenEventKind, EdenGameState, EdenPhase, MissedReason } from './eden-game-state';
import { Apple, EDEN_RULES, EdenRules } from './eden-rules';
import { EdenStanding } from './standings';
import { describe, expect, test } from 'vitest';

/** Three rounds: the specs play a game to its end quickly */
const RULES: EdenRules = { ...EDEN_RULES, rounds: 3 };
const { GOLD, SILVER, RED } = Apple;

function game(players: number = 4, startMoney: number = 0): EdenGameState {
    return new EdenGameState(RULES, players, { voteTime: 30, startMoney });
}

/** Each player votes, undefined for no commitment: they commit in their order, then reveal */
function voted(eden: EdenGameState, apples: ReadonlyArray<Apple | undefined>): void {
    apples.forEach((apple: Apple | undefined, player: number) => apple === undefined || eden.commitApple(player));
    apples.forEach((apple: Apple | undefined, player: number) => apple === undefined || eden.revealApple(player, apple));
}

const lastEvents = (eden: EdenGameState, count: number): ReadonlyArray<Readonly<EdenEvent>> => eden.events().slice(-count);
const standings = (eden: EdenGameState): Array<[number, boolean]> | undefined =>
    eden.result()?.standings.map((standing: Readonly<EdenStanding>) => [standing.place, standing.winner]);

describe('EdenGameState', () => {
    test('should open the vote of the first round to every player, each with the starting money', () => {
        // When
        const eden: EdenGameState = game(4, 500);

        // Then
        expect(eden.phase()).toEqual(EdenPhase.VOTING);
        expect([eden.round(), eden.step()]).toEqual([0, 0]);
        expect(eden.awaited()).toEqual([0, 1, 2, 3]);
        expect(eden.inPlay()).toEqual([0, 1, 2, 3]);
        expect(eden.out()).toEqual([]);
        expect(eden.balances()).toEqual([500, 500, 500, 500]);
        expect(eden.outAt()).toEqual([null, null, null, null]);
        expect(eden.phaseTime()).toEqual(30);
        expect([eden.committed(), eden.absent(), eden.events()]).toEqual([[], [], []]);
        expect(eden.result()).toBeNull();
    });

    test('should ignore the moves out of their phase, of no player, or sent again', () => {
        // Given
        const eden: EdenGameState = game();

        // When
        expect(eden.revealApple(0, RED)).toEqual(Applied.IGNORED);
        expect(eden.commitApple(9)).toEqual(Applied.IGNORED);
        expect(eden.commitApple(-1)).toEqual(Applied.IGNORED);
        expect(eden.commitApple(1.5)).toEqual(Applied.IGNORED);
        expect(eden.commitApple(0)).toEqual(Applied.APPLIED);
        expect(eden.commitApple(0)).toEqual(Applied.IGNORED);
        eden.refuse(0);

        // Then
        expect(eden.events()).toEqual([]);
        expect(eden.committed()).toEqual([0]);
        expect(eden.awaited()).toEqual([1, 2, 3]);
    });

    test('should reveal once every player committed, then count the apples in the order of the players and open the next round', () => {
        // Given
        const eden: EdenGameState = game();
        [3, 1, 0, 2].forEach((player: number) => eden.commitApple(player));

        // When
        expect(eden.phase()).toEqual(EdenPhase.REVEALING);
        expect(eden.awaited()).toEqual([3, 1, 0, 2]);
        expect(eden.phaseTime()).toEqual(RULES.revealTime);
        expect(eden.step()).toEqual(1);
        expect(eden.commitApple(0)).toEqual(Applied.IGNORED);
        eden.revealApple(2, SILVER);
        eden.revealApple(0, RED);
        expect(eden.revealApple(0, RED)).toEqual(Applied.IGNORED);
        eden.revealApple(3, RED);
        eden.revealApple(1, GOLD);

        // Then
        expect(eden.events()).toEqual([{
            kind: EdenEventKind.COUNTED,
            round: 0,
            votes: [{ player: 0, apple: RED }, { player: 1, apple: GOLD }, { player: 2, apple: SILVER }, { player: 3, apple: RED }],
            outcome: AppleOutcome.MIXED,
            lone: null,
            color: null,
            gains: [{ player: 0, gain: -100 }, { player: 1, gain: 100 }, { player: 2, gain: 100 }, { player: 3, gain: -100 }],
        }]);
        expect(eden.balances()).toEqual([-100, 100, 100, -100]);
        expect(eden.phase()).toEqual(EdenPhase.VOTING);
        expect([eden.round(), eden.step()]).toEqual([1, 2]);
        expect(eden.committed()).toEqual([]);
        expect(eden.awaited()).toEqual([0, 1, 2, 3]);
    });

    test('should name the lone red apple, which loses paradise from no money in a single round', () => {
        // Given
        const eden: EdenGameState = game();

        // When
        voted(eden, [GOLD, RED, GOLD, SILVER]);

        // Then
        expect(lastEvents(eden, 2)).toEqual([
            expect.objectContaining({ kind: EdenEventKind.COUNTED, outcome: AppleOutcome.LONE_RED, lone: 1,
                gains: [{ player: 0, gain: 100 }, { player: 1, gain: -1000 }, { player: 2, gain: 100 }, { player: 3, gain: 100 }] }),
            { kind: EdenEventKind.OUT, round: 0, players: [1] },
        ]);
        expect(eden.inPlay()).toEqual([0, 2, 3]);
        expect(eden.out()).toEqual([1]);
        expect(eden.outAt()).toEqual([null, 0, null, null]);
        expect(eden.awaited()).toEqual([0, 2, 3]);
    });

    test('should keep a lone red apple in paradise from 1,000 million, at 0', () => {
        // Given
        const eden: EdenGameState = game(3, 1000);

        // When
        voted(eden, [RED, GOLD, GOLD]);

        // Then
        expect(eden.balances()).toEqual([0, 1100, 1100]);
        expect(eden.inPlay()).toEqual([0, 1, 2]);
        expect(eden.events().map((event: Readonly<EdenEvent>) => event.kind)).toEqual([EdenEventKind.COUNTED]);
    });

    test('should refuse the apple of a player out of paradise at the floor, its balance frozen', () => {
        // Given
        const eden: EdenGameState = game(4, 500);

        // When
        voted(eden, [RED, GOLD, GOLD, SILVER]);

        // Then
        expect(eden.balances()).toEqual([-500, 600, 600, 600]);
        expect(eden.out()).toEqual([0]);
        expect(eden.commitApple(0)).toEqual(Applied.ILLEGAL);
        voted(eden, [undefined, RED, RED, RED]);
        expect(eden.balances()).toEqual([-500, 700, 700, 700]);
    });

    test('should keep a balance above the floor in paradise, the game going on with 2 players in', () => {
        // Given
        const eden: EdenGameState = new EdenGameState(EDEN_RULES, 3, { voteTime: 30, startMoney: 0 });
        const four: EdenGameState = game(4, 0);

        // When
        [0, 1, 2, 3].forEach(() => voted(eden, [RED, RED, GOLD]));
        voted(four, [RED, GOLD, GOLD, GOLD]);
        voted(four, [undefined, RED, GOLD, GOLD]);

        // Then
        expect(eden.balances()).toEqual([-400, -400, 800]);
        expect(eden.out()).toEqual([]);
        expect(four.balances()).toEqual([-1000, -900, 200, 200]);
        expect(four.inPlay()).toEqual([2, 3]);
        expect(four.phase()).toEqual(EdenPhase.VOTING);
        expect(four.awaited()).toEqual([2, 3]);
    });

    test('should take 100 million from a late voter, its apple not counted, absent until it commits again', () => {
        // Given
        const eden: EdenGameState = game(3);
        eden.commitApple(0);
        eden.commitApple(1);

        // When
        eden.close();
        eden.revealApple(0, RED);
        eden.revealApple(1, RED);

        // Then
        expect(lastEvents(eden, 2)).toEqual([
            { kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.VOTING, reason: MissedReason.LATE, players: [2], amount: 100 },
            expect.objectContaining({ kind: EdenEventKind.COUNTED, outcome: AppleOutcome.ALL_RED,
                votes: [{ player: 0, apple: RED }, { player: 1, apple: RED }],
                gains: [{ player: 0, gain: 100 }, { player: 1, gain: 100 }, { player: 2, gain: -100 }] }),
        ]);
        expect(eden.balances()).toEqual([100, 100, -100]);
        expect(eden.absent()).toEqual([2]);
        expect(eden.awaited()).toEqual([0, 1, 2]);
        eden.commitApple(0);
        eden.commitApple(1);
        eden.close();
        expect(eden.absent()).toEqual([2]);
        expect(eden.events().filter((event: Readonly<EdenEvent>) => event.kind === EdenEventKind.MISSED)).toHaveLength(2);
        eden.revealApple(0, RED);
        eden.revealApple(1, RED);
        eden.commitApple(2);
        expect(eden.absent()).toEqual([]);
    });

    test('should count no apple once nobody committed, each player losing 100 million', () => {
        // Given
        const eden: EdenGameState = game(3);

        // When
        eden.close();

        // Then
        expect(lastEvents(eden, 1)).toEqual([expect.objectContaining({ kind: EdenEventKind.COUNTED, outcome: AppleOutcome.NO_VOTE, votes: [],
            gains: [{ player: 0, gain: -100 }, { player: 1, gain: -100 }, { player: 2, gain: -100 }] })]);
        expect([eden.round(), eden.step()]).toEqual([1, 1]);
        eden.close();
        expect(eden.balances()).toEqual([-200, -200, -200]);
    });

    test('should take 1,000 million from a reveal withheld, refused or of no apple, none counted', () => {
        // Given
        const eden: EdenGameState = game(5, 1000);
        [0, 1, 2, 3, 4].forEach((player: number) => eden.commitApple(player));

        // When
        eden.refuse(1);
        expect(eden.revealApple(2, 'green')).toEqual(Applied.ILLEGAL);
        eden.revealApple(0, GOLD);
        eden.revealApple(3, SILVER);
        eden.close();

        // Then
        expect(lastEvents(eden, 4)).toEqual([
            { kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.REVEALING, reason: MissedReason.INVALID, players: [1], amount: 1000 },
            { kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.REVEALING, reason: MissedReason.ILLEGAL, players: [2], amount: 1000 },
            { kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.REVEALING, reason: MissedReason.LATE, players: [4], amount: 1000 },
            expect.objectContaining({ kind: EdenEventKind.COUNTED, outcome: AppleOutcome.TIE,
                gains: [{ player: 1, gain: -1000 }, { player: 2, gain: -1000 }, { player: 4, gain: -1000 }] }),
        ]);
        expect(eden.balances()).toEqual([1000, 0, 0, 1000, 0]);
        expect(eden.absent()).toEqual([4]);
    });

    test('should end at once when fewer than 2 players are still in, the last one winning', () => {
        // Given
        const eden: EdenGameState = game(3);

        // When
        voted(eden, [RED, GOLD, GOLD]);
        voted(eden, [undefined, RED, GOLD]);

        // Then
        expect(eden.phase()).toEqual(EdenPhase.OVER);
        expect(eden.round()).toEqual(1);
        expect(eden.step()).toEqual(4);
        expect(eden.awaited()).toEqual([]);
        expect(eden.result()?.winners).toEqual([2]);
        expect(standings(eden)).toEqual([[3, false], [2, false], [1, true]]);
        eden.close();
        expect(eden.commitApple(2)).toEqual(Applied.IGNORED);
    });

    test('should give no winner once every player still in lost paradise in the same round', () => {
        // Given
        const eden: EdenGameState = game(3);
        voted(eden, [RED, GOLD, GOLD]);
        [1, 2].forEach((player: number) => eden.commitApple(player));

        // When
        eden.close();

        // Then
        expect(eden.phase()).toEqual(EdenPhase.OVER);
        expect(eden.out()).toEqual([0, 1, 2]);
        expect(eden.outAt()).toEqual([0, 1, 1]);
        expect(eden.result()?.winners).toEqual([]);
        expect(standings(eden)).toEqual([[3, false], [1, false], [1, false]]);
    });

    test('should end after its rounds, equal balances sharing the first place, a player out in the last round stepped once', () => {
        // Given
        const eden: EdenGameState = game(4);
        voted(eden, [RED, RED, RED, RED]);
        voted(eden, [RED, RED, RED, RED]);

        // When
        voted(eden, [GOLD, GOLD, RED, SILVER]);

        // Then
        expect(eden.phase()).toEqual(EdenPhase.OVER);
        expect(eden.step()).toEqual(6);
        expect(eden.balances()).toEqual([300, 300, -800, 300]);
        expect(lastEvents(eden, 1)).toEqual([{ kind: EdenEventKind.OUT, round: 2, players: [2] }]);
        expect(eden.result()?.winners).toEqual([0, 1, 3]);
        expect(standings(eden)).toEqual([[1, true], [1, true], [4, false], [1, true]]);
    });

    test('should forget a player absent once it lost paradise', () => {
        // Given
        const eden: EdenGameState = game(4, 500);
        [0, 1, 2].forEach((player: number) => eden.commitApple(player));
        eden.close();

        // When
        eden.revealApple(0, RED);
        eden.revealApple(1, RED);
        eden.close();

        // Then
        expect(eden.balances()).toEqual([600, 600, -500, 400]);
        expect(eden.out()).toEqual([2]);
        expect(eden.absent()).toEqual([3]);
    });
});
