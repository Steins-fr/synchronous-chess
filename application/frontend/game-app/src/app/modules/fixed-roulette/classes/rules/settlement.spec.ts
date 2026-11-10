import { Bets, FIXED_ROULETTE_RULES, Side, totalOf } from './fixed-roulette-rules';
import { GameBets, netOf, payoutOf, pocketStakes, settle, Settlement, SettlementCase } from './settlement';
import { describe, expect, test } from 'vitest';

const { CROUPIER, PUNTER } = Side;
const bets = (croupier: Bets, punter: Bets): GameBets => ({ [CROUPIER]: croupier, [PUNTER]: punter });
const nets = (settlement: Readonly<Settlement>, game: GameBets): [number, number] => [netOf(settlement, game, CROUPIER), netOf(settlement, game, PUNTER)];

/** Who the ball pays, by the chips of each side on it */
function caseOf(croupier: number, punter: number): SettlementCase {
    if (croupier > 0) {
        return punter > 0 ? SettlementCase.SPLIT : SettlementCase.CROUPIER;
    }
    return punter > 0 ? SettlementCase.PUNTER : SettlementCase.BANK;
}

/** The bets of the issue: the croupier 15 on 2 and 50 on 3, the punter 35 on 2 and 30 on 4 */
const ISSUE: GameBets = bets([0, 15, 50, 0], [0, 35, 0, 30]);

describe('settle', () => {
    test('should share the chips of the other pockets in the ratio of the chips on the ball when both sides are on it: the example of the issue', () => {
        // When
        const settlement: Settlement = settle(ISSUE, 2);

        // Then
        expect(settlement).toEqual({
            kind: SettlementCase.SPLIT, back: { [CROUPIER]: 15, [PUNTER]: 35 }, won: { [CROUPIER]: 24, [PUNTER]: 56 }, bank: 0, leftover: 0,
        });
        expect([payoutOf(settlement, CROUPIER), payoutOf(settlement, PUNTER)]).toEqual([39, 91]);
        expect(nets(settlement, ISSUE)).toEqual([-26, 26]);
    });

    test.each<[number, SettlementCase, [number, number], number]>([
        [3, SettlementCase.CROUPIER, [65, -65], 0],
        [4, SettlementCase.PUNTER, [-65, 65], 0],
        [1, SettlementCase.BANK, [-65, -65], 130],
    ])('should settle the bets of the issue on the ball in pocket %i as %s', (ball: number, kind: SettlementCase, net: [number, number], bank: number) => {
        // When
        const settlement: Settlement = settle(ISSUE, ball);

        // Then
        expect(settlement.kind).toEqual(kind);
        expect(nets(settlement, ISSUE)).toEqual(net);
        expect([settlement.bank, settlement.leftover]).toEqual([bank, 0]);
    });

    test('should give one side alone on the ball its chips on it and every chip of the other pockets', () => {
        // When
        const settlement: Settlement = settle(ISSUE, 3);

        // Then
        expect([settlement.back, settlement.won]).toEqual([{ [CROUPIER]: 50, [PUNTER]: 0 }, { [CROUPIER]: 80, [PUNTER]: 0 }]);
    });

    test('should floor each share of a split, the leftover chip to the punter', () => {
        // Given
        const game: GameBets = bets([10, 5, 0, 0], [20, 0, 0, 0]);

        // When
        const settlement: Settlement = settle(game, 1);

        // Then
        expect(settlement).toEqual({
            kind: SettlementCase.SPLIT, back: { [CROUPIER]: 10, [PUNTER]: 20 }, won: { [CROUPIER]: 1, [PUNTER]: 4 }, bank: 0, leftover: 1,
        });
        expect(nets(settlement, game)).toEqual([-4, 4]);
    });

    test('should give each side its chips back when both bet on the ball only', () => {
        // Given
        const game: GameBets = bets([0, 0, 10, 0], [0, 0, 30, 0]);

        // When
        const settlement: Settlement = settle(game, 3);

        // Then
        expect(settlement.kind).toEqual(SettlementCase.SPLIT);
        expect(nets(settlement, game)).toEqual([0, 0]);
        expect([settlement.bank, settlement.leftover]).toEqual([0, 0]);
    });

    test('should give the bank every chip of both sides all in off the ball', () => {
        // Given
        const game: GameBets = bets([500, 0, 0, 0], [0, 500, 0, 0]);

        // When
        const settlement: Settlement = settle(game, 3);

        // Then
        expect(settlement.kind).toEqual(SettlementCase.BANK);
        expect(settlement.bank).toEqual(1000);
        expect([payoutOf(settlement, CROUPIER), payoutOf(settlement, PUNTER)]).toEqual([0, 0]);
        expect(nets(settlement, game)).toEqual([-500, -500]);
    });

    test('should keep every chip bet, in amounts of 0 or more, the leftover chip in a split only, for every bets and ball', () => {
        // Given every bets of 0, 1, 2 or 7 chips on each pocket, of each side
        const amounts: ReadonlyArray<number> = [0, 1, 2, 7];
        const pockets: number = FIXED_ROULETTE_RULES.pockets;
        const violations: string[] = [];

        // When
        for (let code = 0; code < amounts.length ** (2 * pockets); code++) {
            const chips: number[] = Array.from({ length: 2 * pockets }, (_, index: number) => amounts[Math.floor(code / amounts.length ** index) % amounts.length]);
            const game: GameBets = bets(chips.slice(0, pockets), chips.slice(pockets));
            for (let ball = 1; ball <= pockets; ball++) {
                const settlement: Settlement = settle(game, ball);
                const { back, won, bank, leftover, kind } = settlement;
                const croupier: number = game[CROUPIER][ball - 1];
                const punter: number = game[PUNTER][ball - 1];
                const lost: number = totalOf(game[CROUPIER]) + totalOf(game[PUNTER]) - croupier - punter;
                const amountsOf: ReadonlyArray<number> = [back[CROUPIER], back[PUNTER], won[CROUPIER], won[PUNTER], bank, leftover];

                if (payoutOf(settlement, CROUPIER) + payoutOf(settlement, PUNTER) + bank !== totalOf(game[CROUPIER]) + totalOf(game[PUNTER])) {
                    violations.push(`chips not kept: ${ chips.join(',') } ball ${ ball }`);
                }
                if (amountsOf.some((amount: number) => !Number.isInteger(amount) || amount < 0)) {
                    violations.push(`amount not a whole number of chips: ${ chips.join(',') } ball ${ ball }`);
                }
                if (kind !== caseOf(croupier, punter) || (kind !== SettlementCase.SPLIT && leftover !== 0) || leftover > 1) {
                    violations.push(`wrong case or leftover: ${ chips.join(',') } ball ${ ball }`);
                }
                if ([back[CROUPIER], back[PUNTER]].join() !== [croupier, punter].join()
                    || (kind === SettlementCase.SPLIT && won[CROUPIER] !== Math.floor(lost * croupier / (croupier + punter)))) {
                    violations.push(`wrong share: ${ chips.join(',') } ball ${ ball }`);
                }
            }
        }

        // Then
        expect(violations).toEqual([]);
    });
});

describe('pocketStakes', () => {
    test('should tell the chips of each player on each pocket, the croupier the first or the second player', () => {
        // Then
        expect(pocketStakes(FIXED_ROULETTE_RULES, ISSUE, 0)).toEqual([[0, 0], [15, 35], [50, 0], [0, 30]]);
        expect(pocketStakes(FIXED_ROULETTE_RULES, ISSUE, 1)).toEqual([[0, 0], [35, 15], [0, 50], [30, 0]]);
    });

    test('should leave the pockets bare for a side yet to bet', () => {
        // Then
        expect(pocketStakes(FIXED_ROULETTE_RULES, { [CROUPIER]: [0, 15, 50, 0], [PUNTER]: null }, 1)).toEqual([[0, 0], [0, 15], [0, 50], [0, 0]]);
        expect(pocketStakes(FIXED_ROULETTE_RULES, { [CROUPIER]: null, [PUNTER]: null }, 0)).toEqual([[0, 0], [0, 0], [0, 0], [0, 0]]);
    });
});
