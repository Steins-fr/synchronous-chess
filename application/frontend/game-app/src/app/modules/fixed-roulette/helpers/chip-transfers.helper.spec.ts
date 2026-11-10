import { describe, expect, test } from 'vitest';
import { FixedRouletteEventKind, SettledEvent } from '../classes/rules/fixed-roulette-game-state';
import { Bets, Side, totalOf } from '../classes/rules/fixed-roulette-rules';
import { settle } from '../classes/rules/settlement';
import { betTransfers, ChipPlace, ChipPlaceKind, ChipTransfer, settlementTransfers, voidTransfers } from './chip-transfers.helper';

const stack = (player: number): ChipPlace => ({ kind: ChipPlaceKind.STACK, player });
const pocket = (player: number, number: number): ChipPlace => ({ kind: ChipPlaceKind.POCKET, player, pocket: number });
const BANK: ChipPlace = { kind: ChipPlaceKind.BANK };

/** The bets of the example of the rules: the croupier, bob, on pockets 2 and 3, the punter, alice, on pockets 2 and 4 */
const CROUPIER_BETS: Bets = [0, 15, 50, 0];
const PUNTER_BETS: Bets = [0, 35, 0, 30];
const settled = (ball: number, croupierBets: Bets = CROUPIER_BETS, punterBets: Bets = PUNTER_BETS): SettledEvent => {
    const bets = { [Side.CROUPIER]: croupierBets, [Side.PUNTER]: punterBets };
    return { kind: FixedRouletteEventKind.SETTLED, round: 0, croupier: 1, ball, bets, settlement: settle(bets, ball) };
};
const moved = (transfers: ReadonlyArray<Readonly<ChipTransfer>>, place: ChipPlace): number => transfers
    .filter((transfer: Readonly<ChipTransfer>) => JSON.stringify(transfer.to) === JSON.stringify(place))
    .reduce((total: number, transfer: Readonly<ChipTransfer>) => total + transfer.amount, 0);

describe('betTransfers', () => {
    test('should move the chips of the bets from the stack of the player to each pocket it covered', () => {
        expect(betTransfers(1, CROUPIER_BETS)).toEqual([
            { from: stack(1), to: pocket(1, 2), amount: 15 },
            { from: stack(1), to: pocket(1, 3), amount: 50 },
        ]);
    });
});

describe('voidTransfers', () => {
    test('should move the bets of a game void back to their owners', () => {
        expect(voidTransfers({ [Side.CROUPIER]: CROUPIER_BETS, [Side.PUNTER]: PUNTER_BETS }, 1)).toEqual([
            { from: pocket(1, 2), to: stack(1), amount: 15 },
            { from: pocket(1, 3), to: stack(1), amount: 50 },
            { from: pocket(0, 2), to: stack(0), amount: 35 },
            { from: pocket(0, 4), to: stack(0), amount: 30 },
        ]);
    });

    test('should move nothing for a side yet to bet', () => {
        expect(voidTransfers({ [Side.CROUPIER]: [5, 0, 0, 0], [Side.PUNTER]: null }, 0)).toEqual([{ from: pocket(0, 1), to: stack(0), amount: 5 }]);
        expect(voidTransfers({ [Side.CROUPIER]: null, [Side.PUNTER]: null }, 0)).toEqual([]);
    });
});

describe('settlementTransfers', () => {
    test('should share the chips of the other pockets between both players on the ball, a stake flying to both', () => {
        expect(settlementTransfers(settled(2))).toEqual([
            { from: pocket(1, 2), to: stack(1), amount: 15 },
            { from: pocket(0, 2), to: stack(0), amount: 35 },
            { from: pocket(1, 3), to: stack(1), amount: 24 },
            { from: pocket(1, 3), to: stack(0), amount: 26 },
            { from: pocket(0, 4), to: stack(0), amount: 30 },
        ]);
    });

    test('should give the chips of the other pockets to the croupier alone on the ball', () => {
        expect(settlementTransfers(settled(3))).toEqual([
            { from: pocket(1, 3), to: stack(1), amount: 50 },
            { from: pocket(1, 2), to: stack(1), amount: 15 },
            { from: pocket(0, 2), to: stack(1), amount: 35 },
            { from: pocket(0, 4), to: stack(1), amount: 30 },
        ]);
    });

    test('should give the chips of the other pockets to the punter alone on the ball', () => {
        expect(settlementTransfers(settled(4))).toEqual([
            { from: pocket(0, 4), to: stack(0), amount: 30 },
            { from: pocket(1, 2), to: stack(0), amount: 15 },
            { from: pocket(1, 3), to: stack(0), amount: 50 },
            { from: pocket(0, 2), to: stack(0), amount: 35 },
        ]);
    });

    test('should give every chip bet to the bank when no one bet on the ball', () => {
        expect(settlementTransfers(settled(1))).toEqual([
            { from: pocket(1, 2), to: BANK, amount: 15 },
            { from: pocket(1, 3), to: BANK, amount: 50 },
            { from: pocket(0, 2), to: BANK, amount: 35 },
            { from: pocket(0, 4), to: BANK, amount: 30 },
        ]);
    });

    test('should give the chip left over of a split to the punter', () => {
        // Given the floored split of the rules: 5 chips to share, 1 to the croupier and 4 to the punter
        const transfers: ReadonlyArray<Readonly<ChipTransfer>> = settlementTransfers(settled(1, [10, 5, 0, 0], [20, 0, 0, 0]));

        // Then
        expect(transfers).toEqual([
            { from: pocket(1, 1), to: stack(1), amount: 10 },
            { from: pocket(0, 1), to: stack(0), amount: 20 },
            { from: pocket(1, 2), to: stack(1), amount: 1 },
            { from: pocket(1, 2), to: stack(0), amount: 4 },
        ]);
    });

    test('should move every chip bet, each one to where the settlement sends it', () => {
        // Given every mix of a few stakes
        const stakes: ReadonlyArray<number> = [0, 1, 7];
        const mixes: ReadonlyArray<Bets> = stakes.flatMap((one: number) => stakes.flatMap((two: number) => stakes.map((three: number): Bets => [one, two, three, 0])));

        mixes.forEach((croupierBets: Bets) => mixes.forEach((punterBets: Bets) => [1, 2, 3, 4].forEach((ball: number) => {
            // When
            const event: SettledEvent = settled(ball, croupierBets, punterBets);
            const transfers: ReadonlyArray<Readonly<ChipTransfer>> = settlementTransfers(event);

            // Then
            const { back, won, bank } = event.settlement;
            expect(transfers.every((transfer: Readonly<ChipTransfer>) => transfer.amount > 0)).toBe(true);
            expect(transfers.reduce((total: number, transfer: Readonly<ChipTransfer>) => total + transfer.amount, 0)).toEqual(totalOf(croupierBets) + totalOf(punterBets));
            expect(moved(transfers, stack(1))).toEqual(back[Side.CROUPIER] + won[Side.CROUPIER]);
            expect(moved(transfers, stack(0))).toEqual(back[Side.PUNTER] + won[Side.PUNTER]);
            expect(moved(transfers, BANK)).toEqual(bank);
        })));
    });
});
