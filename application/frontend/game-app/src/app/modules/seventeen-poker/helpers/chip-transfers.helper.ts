import { PokerSeat, SeatPair } from '../classes/rules/poker-seat';

/** The chips on the table, as it shows them */
export interface TableChips {
    /** The chips of each player, in front of its seat */
    readonly stacks: SeatPair<number>;
    /** The bets of the round in progress, on the cloth in front of each player */
    readonly bets: SeatPair<number>;
    /** The chips in the middle of the cloth */
    readonly pot: number;
}

export enum ChipPlaceKind {
    STACK = 'stack',
    BET = 'bet',
    POT = 'pot',
    /** Off the table: the antes of a no contest */
    BANK = 'bank',
}

export type ChipPlace = { readonly kind: ChipPlaceKind.STACK | ChipPlaceKind.BET; readonly seat: PokerSeat } | { readonly kind: ChipPlaceKind.POT | ChipPlaceKind.BANK };

/** Chips going from a place of the table to another one */
export interface ChipTransfer {
    readonly from: ChipPlace;
    readonly to: ChipPlace;
    readonly amount: number;
}

const POT: ChipPlace = { kind: ChipPlaceKind.POT };
const BANK: ChipPlace = { kind: ChipPlaceKind.BANK };

const sum = (pair: SeatPair<number>): number => pair[0] + pair[1];

/**
 * The chips moved from a state of the table to the next one: a bet goes from the stack of its player to the cloth in
 * front of it, the antes and the bets of a round over to the pot, the pot to the players winning it, else to the bank.
 * A player taking the pot alone while bets lie on the cloth (a fold) takes them with it, straight from the cloth.
 */
export function chipTransfers(previous: Readonly<TableChips>, current: Readonly<TableChips>): ReadonlyArray<Readonly<ChipTransfer>> {
    const seats: ReadonlyArray<PokerSeat> = [PokerSeat.ONE, PokerSeat.TWO];
    const winners: ReadonlyArray<PokerSeat> = seats.filter((seat: PokerSeat) => current.stacks[seat] > previous.stacks[seat]);
    const taker: ChipPlace = winners.length === 1 ? { kind: ChipPlaceKind.STACK, seat: winners[0] } : POT;
    const taken: number = winners.length === 1 ? seats.reduce((chips: number, seat: PokerSeat) => chips + Math.max(previous.bets[seat] - current.bets[seat], 0), 0) : 0;
    const transfers: ChipTransfer[] = [];
    let paid: number = 0;
    let won: number = 0;

    for (const seat of seats) {
        const stack: ChipPlace = { kind: ChipPlaceKind.STACK, seat };
        const bet: ChipPlace = { kind: ChipPlaceKind.BET, seat };
        const betChange: number = current.bets[seat] - previous.bets[seat];
        const stackChange: number = current.stacks[seat] - previous.stacks[seat];
        // The chips leaving the stack but for the bet: the ante
        const ante: number = -stackChange - Math.max(betChange, 0);

        if (betChange > 0) {
            transfers.push({ from: stack, to: bet, amount: betChange });
        } else if (betChange < 0) {
            transfers.push({ from: bet, to: taker, amount: -betChange });
        }

        if (ante > 0) {
            transfers.push({ from: stack, to: POT, amount: ante });
            paid += ante;
        } else if (stackChange > taken) {
            transfers.push({ from: POT, to: stack, amount: stackChange - taken });
        }

        paid += Math.max(betChange, 0);
        won += Math.max(stackChange, 0);
    }

    // The chips of the cloth no player took: the bank keeps them
    const banked: number = previous.pot + sum(previous.bets) + paid - current.pot - sum(current.bets) - won;

    if (banked > 0) {
        transfers.push({ from: POT, to: BANK, amount: banked });
    }

    return transfers;
}
