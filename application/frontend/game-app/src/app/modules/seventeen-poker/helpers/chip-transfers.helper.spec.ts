import { describe, expect, test } from 'vitest';
import { PokerSeat } from '../classes/rules/poker-seat';
import { ChipPlace, ChipPlaceKind, chipTransfers, ChipTransfer, TableChips } from './chip-transfers.helper';

const { ONE, TWO } = PokerSeat;
const stack = (seat: PokerSeat): ChipPlace => ({ kind: ChipPlaceKind.STACK, seat });
const bet = (seat: PokerSeat): ChipPlace => ({ kind: ChipPlaceKind.BET, seat });
const POT: ChipPlace = { kind: ChipPlaceKind.POT };
const BANK: ChipPlace = { kind: ChipPlaceKind.BANK };

describe('chipTransfers', () => {
    test.each<{ name: string; previous: TableChips; current: TableChips; transfers: ChipTransfer[] }>([
        {
            name: 'nothing while the chips stay',
            previous: { stacks: [145, 145], bets: [0, 0], pot: 10 },
            current: { stacks: [145, 145], bets: [0, 0], pot: 10 },
            transfers: [],
        },
        {
            name: 'the antes to the pot',
            previous: { stacks: [150, 150], bets: [0, 0], pot: 0 },
            current: { stacks: [145, 145], bets: [0, 0], pot: 10 },
            transfers: [{ from: stack(ONE), to: POT, amount: 5 }, { from: stack(TWO), to: POT, amount: 5 }],
        },
        {
            name: 'a bet in front of its player',
            previous: { stacks: [145, 139], bets: [0, 6], pot: 10 },
            current: { stacks: [133, 139], bets: [12, 6], pot: 10 },
            transfers: [{ from: stack(ONE), to: bet(ONE), amount: 12 }],
        },
        {
            name: 'the bets of a round over to the pot',
            previous: { stacks: [133, 133], bets: [12, 12], pot: 10 },
            current: { stacks: [133, 133], bets: [0, 0], pot: 34 },
            transfers: [{ from: bet(ONE), to: POT, amount: 12 }, { from: bet(TWO), to: POT, amount: 12 }],
        },
        {
            name: 'the pot to its winner',
            previous: { stacks: [133, 133], bets: [0, 0], pot: 34 },
            current: { stacks: [133, 167], bets: [0, 0], pot: 0 },
            transfers: [{ from: POT, to: stack(TWO), amount: 34 }],
        },
        {
            name: 'a split pot, half to each player',
            previous: { stacks: [133, 133], bets: [0, 0], pot: 34 },
            current: { stacks: [150, 150], bets: [0, 0], pot: 0 },
            transfers: [{ from: POT, to: stack(ONE), amount: 17 }, { from: POT, to: stack(TWO), amount: 17 }],
        },
        {
            name: 'the bet and the pot of a fold, the pot to the other player',
            previous: { stacks: [144, 145], bets: [1, 0], pot: 10 },
            current: { stacks: [155, 145], bets: [0, 0], pot: 0 },
            transfers: [{ from: bet(ONE), to: POT, amount: 1 }, { from: POT, to: stack(ONE), amount: 11 }],
        },
        {
            name: 'the antes of a no contest to the bank',
            previous: { stacks: [145, 145], bets: [0, 0], pot: 10 },
            current: { stacks: [145, 145], bets: [0, 0], pot: 0 },
            transfers: [{ from: POT, to: BANK, amount: 10 }],
        },
    ])('should move $name', ({ previous, current, transfers }) => {
        expect(chipTransfers(previous, current)).toEqual(transfers);
    });
});
