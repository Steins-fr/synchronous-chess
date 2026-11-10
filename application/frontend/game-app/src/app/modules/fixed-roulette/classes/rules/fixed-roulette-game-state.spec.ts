import { Applied } from '@app/modules/commit-reveal/classes/applied';
import {
    CheatKind, FixedRouletteEvent, FixedRouletteEventKind, FixedRouletteGameState, FixedRoulettePhase, lastSettled, MatchEnd,
} from './fixed-roulette-game-state';
import { Bets, FIXED_ROULETTE_RULES, Side, totalOf } from './fixed-roulette-rules';
import { settle } from './settlement';
import { describe, expect, test } from 'vitest';

const { CROUPIER, PUNTER } = Side;
const { PLACING, BETTING, REVEALING, OVER } = FixedRoulettePhase;
const NO_BETS = { [CROUPIER]: null, [PUNTER]: null };
/** The bets of the issue: the croupier 15 on 2 and 50 on 3, the punter 35 on 2 and 30 on 4 */
const CROUPIER_BETS: Bets = [0, 15, 50, 0];
const PUNTER_BETS: Bets = [0, 35, 0, 30];

function game(first: number = 0, betTime: number = 60): FixedRouletteGameState {
    return new FixedRouletteGameState(FIXED_ROULETTE_RULES, { betTime }, first);
}

/** A game of the match played: the croupier places, the punter bets, the croupier reveals */
function played(roulette: FixedRouletteGameState, croupierBets: Bets, punterBets: Bets, ball: unknown): void {
    roulette.place(roulette.croupier(), croupierBets);
    roulette.bet(roulette.punter(), punterBets);
    roulette.reveal(roulette.croupier(), ball);
}

const lastEvent = (roulette: FixedRouletteGameState): Readonly<FixedRouletteEvent> => roulette.events()[roulette.events().length - 1];
/** Every chip of the match: the stacks of the players, the bets on the table and the bank */
const allChips = (roulette: FixedRouletteGameState): number =>
    roulette.chips()[0] + roulette.chips()[1] + totalOf(roulette.bets()[CROUPIER] ?? []) + totalOf(roulette.bets()[PUNTER] ?? []) + roulette.bank();

describe('FixedRouletteGameState', () => {
    test.each([0, 1])('should await the croupier drawn, player %i, placing, every player with its chips', (first: number) => {
        // When
        const roulette: FixedRouletteGameState = game(first, 30);

        // Then
        expect([roulette.phase(), roulette.round(), roulette.step()]).toEqual([PLACING, 0, 0]);
        expect([roulette.croupier(), roulette.punter()]).toEqual([first, 1 - first]);
        expect(roulette.awaited()).toEqual([first]);
        expect(roulette.phaseTime()).toEqual(30);
        expect(roulette.chips()).toEqual([500, 500]);
        expect([roulette.bank(), roulette.bets(), roulette.events(), roulette.result()]).toEqual([0, NO_BETS, [], null]);
        expect(lastSettled(roulette.events())).toBeNull();
    });

    test('should await the punter once the croupier placed, the croupier revealing once the punter bet, then settle and swap the roles', () => {
        // Given
        const roulette: FixedRouletteGameState = game();

        // When
        expect(roulette.place(0, CROUPIER_BETS)).toEqual(Applied.APPLIED);

        // Then
        expect([roulette.phase(), roulette.step(), roulette.awaited(), roulette.phaseTime()]).toEqual([BETTING, 1, [1], 60]);
        expect(roulette.bets()).toEqual({ [CROUPIER]: CROUPIER_BETS, [PUNTER]: null });
        expect(roulette.chips()).toEqual([435, 500]);
        expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.PLACED, round: 0, croupier: 0, bets: CROUPIER_BETS });

        // When
        expect(roulette.bet(1, PUNTER_BETS)).toEqual(Applied.APPLIED);

        // Then
        expect([roulette.phase(), roulette.step(), roulette.awaited()]).toEqual([REVEALING, 2, [0]]);
        expect(roulette.phaseTime()).toEqual(FIXED_ROULETTE_RULES.revealTime);
        expect(roulette.bets()).toEqual({ [CROUPIER]: CROUPIER_BETS, [PUNTER]: PUNTER_BETS });
        expect(roulette.chips()).toEqual([435, 435]);
        expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.BET, round: 0, punter: 1, bets: PUNTER_BETS });

        // When
        expect(roulette.reveal(0, 2)).toEqual(Applied.APPLIED);

        // Then the example of the issue: the croupier loses 26 chips
        const bets = { [CROUPIER]: CROUPIER_BETS, [PUNTER]: PUNTER_BETS };
        const settled: Readonly<FixedRouletteEvent> = { kind: FixedRouletteEventKind.SETTLED, round: 0, croupier: 0, ball: 2, bets, settlement: settle(bets, 2) };
        expect(lastEvent(roulette)).toEqual(settled);
        expect(lastSettled(roulette.events())).toEqual(settled);
        expect(roulette.chips()).toEqual([474, 526]);
        expect([roulette.phase(), roulette.round(), roulette.step(), roulette.bets()]).toEqual([PLACING, 1, 3, NO_BETS]);
        expect([roulette.croupier(), roulette.punter(), roulette.awaited()]).toEqual([1, 0, [1]]);

        // When
        roulette.place(1, [0, 0, 0, 10]);

        // Then the game settled stays the latest one
        expect(lastSettled(roulette.events())).toEqual(settled);
    });

    test('should ignore the moves out of their phase, of no player, or sent again, and tell the moves of the player not awaited', () => {
        // Given
        const roulette: FixedRouletteGameState = game();

        // Then a punter betting before the croupier, a reveal before the bets
        expect(roulette.bet(1, PUNTER_BETS)).toEqual(Applied.IGNORED);
        expect(roulette.reveal(0, 2)).toEqual(Applied.IGNORED);
        expect(roulette.refuse(0)).toEqual(Applied.IGNORED);
        expect([roulette.place(2, CROUPIER_BETS), roulette.place(-1, CROUPIER_BETS), roulette.place(0.5, CROUPIER_BETS)])
            .toEqual([Applied.IGNORED, Applied.IGNORED, Applied.IGNORED]);
        expect(roulette.place(1, CROUPIER_BETS)).toEqual(Applied.ILLEGAL);

        // When
        roulette.place(0, CROUPIER_BETS);

        // Then a croupier placing again once it placed
        expect(roulette.place(0, [1, 0, 0, 0])).toEqual(Applied.IGNORED);
        expect(roulette.bet(2, PUNTER_BETS)).toEqual(Applied.IGNORED);
        expect(roulette.bet(0, PUNTER_BETS)).toEqual(Applied.ILLEGAL);

        // When
        roulette.bet(1, PUNTER_BETS);

        // Then
        expect(roulette.bet(1, [0, 0, 0, 100])).toEqual(Applied.IGNORED);
        expect(roulette.place(0, CROUPIER_BETS)).toEqual(Applied.IGNORED);
        expect(roulette.reveal(1, 2)).toEqual(Applied.IGNORED);
        expect(roulette.refuse(1)).toEqual(Applied.IGNORED);
        expect([roulette.phase(), roulette.step(), roulette.chips()]).toEqual([REVEALING, 2, [435, 435]]);
        expect(roulette.bets()).toEqual({ [CROUPIER]: CROUPIER_BETS, [PUNTER]: PUNTER_BETS });
    });

    test('should refuse the bets against the rules, the player still awaited', () => {
        // Given
        const roulette: FixedRouletteGameState = game();

        // Then
        expect(roulette.place(0, [0, 0, 0, 0])).toEqual(Applied.ILLEGAL);
        expect(roulette.place(0, [501, 0, 0, 0])).toEqual(Applied.ILLEGAL);
        expect([roulette.phase(), roulette.step(), roulette.awaited(), roulette.chips(), roulette.events()]).toEqual([PLACING, 0, [0], [500, 500], []]);

        // When
        roulette.place(0, CROUPIER_BETS);

        // Then under the croupier's total, on 3 pockets, over its chips
        expect(roulette.bet(1, [0, 35, 0, 29])).toEqual(Applied.ILLEGAL);
        expect(roulette.bet(1, [10, 35, 0, 30])).toEqual(Applied.ILLEGAL);
        expect(roulette.bet(1, [0, 501, 0, 0])).toEqual(Applied.ILLEGAL);
        expect([roulette.phase(), roulette.step(), roulette.awaited(), roulette.chips()]).toEqual([BETTING, 1, [1], [435, 500]]);
        expect(roulette.bet(1, [0, 0, 0, 500])).toEqual(Applied.APPLIED);
    });

    test('should end the match after its games, the croupiers by turns, the player of the more chips winning, every chip kept', () => {
        // Given
        const roulette: FixedRouletteGameState = game(1);
        const croupiers: number[] = [];

        // When the first player wins 10 chips each game: the ball on its pocket
        for (let round = 0; round < FIXED_ROULETTE_RULES.games; round++) {
            croupiers.push(roulette.croupier());
            const firstIsCroupier: boolean = roulette.croupier() === 0;
            played(roulette, [10, 0, 0, 0], [0, 10, 0, 0], firstIsCroupier ? 1 : 2);
            expect(allChips(roulette)).toEqual(1000);
        }

        // Then
        expect(croupiers).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
        expect([roulette.phase(), roulette.round(), roulette.step(), roulette.awaited()]).toEqual([OVER, 9, 30, []]);
        expect(roulette.bets()).toEqual(NO_BETS);
        expect(roulette.result()).toEqual({ winner: 0, end: MatchEnd.GAMES, cause: null, chips: [600, 400] });
        expect(roulette.close()).toEqual(Applied.IGNORED);
        expect(roulette.place(1, [10, 0, 0, 0])).toEqual(Applied.IGNORED);
    });

    test('should tell a draw on equal chips after the games', () => {
        // Given
        const roulette: FixedRouletteGameState = game();

        // When the bank takes 10 chips of each player each game
        for (let round = 0; round < FIXED_ROULETTE_RULES.games; round++) {
            played(roulette, [10, 0, 0, 0], [0, 10, 0, 0], 3);
        }

        // Then
        expect(roulette.result()).toEqual({ winner: null, end: MatchEnd.GAMES, cause: null, chips: [400, 400] });
        expect(roulette.bank()).toEqual(200);
    });

    describe('a player without chips', () => {
        test('should end the match at once, the player without chips losing', () => {
            // Given
            const roulette: FixedRouletteGameState = game();

            // When
            played(roulette, [500, 0, 0, 0], [0, 500, 0, 0], 1);

            // Then
            expect(roulette.result()).toEqual({ winner: 0, end: MatchEnd.BANKRUPT, cause: null, chips: [1000, 0] });
            expect([roulette.phase(), roulette.round(), roulette.step()]).toEqual([OVER, 0, 3]);
        });

        test('should tell a draw when both bet all their chips off the ball, the bank taking them', () => {
            // Given
            const roulette: FixedRouletteGameState = game();

            // When
            played(roulette, [500, 0, 0, 0], [0, 500, 0, 0], 3);

            // Then
            expect(roulette.result()).toEqual({ winner: null, end: MatchEnd.BANKRUPT, cause: null, chips: [0, 0] });
            expect(roulette.bank()).toEqual(1000);
        });

        test('should let a punter holding less than the croupier bet all its chips, no less', () => {
            // Given the first player left with 40 chips
            const roulette: FixedRouletteGameState = game();
            played(roulette, [460, 0, 0, 0], [0, 460, 0, 0], 2);
            expect(roulette.chips()).toEqual([40, 960]);
            roulette.place(1, [100, 0, 0, 0]);

            // Then
            expect(roulette.bet(0, [0, 39, 0, 0])).toEqual(Applied.ILLEGAL);
            expect(roulette.bet(0, [0, 40, 0, 0])).toEqual(Applied.APPLIED);

            // When
            roulette.reveal(1, 1);

            // Then
            expect(roulette.result()).toEqual({ winner: 1, end: MatchEnd.BANKRUPT, cause: null, chips: [0, 1000] });
        });
    });

    describe('a forfeit', () => {
        test('should forfeit the match of a croupier late to place, the other player winning', () => {
            // Given
            const roulette: FixedRouletteGameState = game(1);

            // When
            expect(roulette.close()).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.LATE, round: 0, player: 1, phase: PLACING });
            expect(roulette.result()).toEqual({ winner: 0, end: MatchEnd.FORFEIT, cause: PLACING, chips: [500, 500] });
            expect([roulette.phase(), roulette.step(), roulette.awaited()]).toEqual([OVER, 1, []]);
        });

        test('should forfeit the match of a punter late to bet, the bets of the croupier back to it', () => {
            // Given
            const roulette: FixedRouletteGameState = game();
            played(roulette, [10, 0, 0, 0], [0, 10, 0, 0], 1);
            roulette.place(1, [0, 0, 30, 0]);

            // When
            expect(roulette.close()).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.LATE, round: 1, player: 0, phase: BETTING });
            expect(roulette.result()).toEqual({ winner: 1, end: MatchEnd.FORFEIT, cause: BETTING, chips: [510, 490] });
            expect([roulette.bets(), roulette.bank()]).toEqual([NO_BETS, 0]);
        });

        test('should forfeit the match of a croupier late to reveal, the bets of both back to them', () => {
            // Given
            const roulette: FixedRouletteGameState = game();
            roulette.place(0, CROUPIER_BETS);
            roulette.bet(1, PUNTER_BETS);

            // When
            expect(roulette.close()).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.LATE, round: 0, player: 0, phase: REVEALING });
            expect(roulette.result()).toEqual({ winner: 1, end: MatchEnd.FORFEIT, cause: REVEALING, chips: [500, 500] });
            expect(roulette.close()).toEqual(Applied.IGNORED);
            expect(roulette.reveal(0, 2)).toEqual(Applied.IGNORED);
        });

        test('should forfeit the match of a croupier whose reveal does not match its commitment', () => {
            // Given
            const roulette: FixedRouletteGameState = game(1);
            roulette.place(1, CROUPIER_BETS);
            roulette.bet(0, PUNTER_BETS);

            // When
            expect(roulette.refuse(1)).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.CHEATED, round: 0, player: 1, reason: CheatKind.INVALID_REVEAL });
            expect(roulette.result()).toEqual({ winner: 0, end: MatchEnd.CHEAT, cause: CheatKind.INVALID_REVEAL, chips: [500, 500] });
            expect(roulette.reveal(1, 2)).toEqual(Applied.IGNORED);
        });

        test.each([0, 5, 2.5, '2', undefined])('should forfeit the match of a croupier revealing the ball %o, out of the wheel', (ball: unknown) => {
            // Given
            const roulette: FixedRouletteGameState = game();
            roulette.place(0, CROUPIER_BETS);
            roulette.bet(1, PUNTER_BETS);

            // When
            expect(roulette.reveal(0, ball)).toEqual(Applied.ILLEGAL);

            // Then
            expect(lastEvent(roulette)).toEqual({ kind: FixedRouletteEventKind.CHEATED, round: 0, player: 0, reason: CheatKind.ILLEGAL_POCKET });
            expect(roulette.result()).toEqual({ winner: 1, end: MatchEnd.CHEAT, cause: CheatKind.ILLEGAL_POCKET, chips: [500, 500] });
            expect([roulette.phase(), roulette.step()]).toEqual([OVER, 3]);
        });
    });
});
