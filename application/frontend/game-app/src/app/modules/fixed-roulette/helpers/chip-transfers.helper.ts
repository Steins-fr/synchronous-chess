import { SettledEvent } from '../classes/rules/fixed-roulette-game-state';
import { Bets, Side } from '../classes/rules/fixed-roulette-rules';
import { PlacedBets } from '../classes/rules/settlement';

export enum ChipPlaceKind {
    /** The chips of a player off the table, on its seat */
    STACK = 'stack',
    /** The chips of a player on a pocket of the wheel */
    POCKET = 'pocket',
    /** Off the table: the chips no player bet on the ball */
    BANK = 'bank',
}

/** A place of the chips, a player by its index in the match, a pocket numbered from 1 */
export type ChipPlace =
    | { readonly kind: ChipPlaceKind.STACK; readonly player: number }
    | { readonly kind: ChipPlaceKind.POCKET; readonly player: number; readonly pocket: number }
    | { readonly kind: ChipPlaceKind.BANK };

/** Chips going from a place of the table to another one */
export interface ChipTransfer {
    readonly from: ChipPlace;
    readonly to: ChipPlace;
    readonly amount: number;
}

const BANK: ChipPlace = { kind: ChipPlaceKind.BANK };
const stack = (player: number): ChipPlace => ({ kind: ChipPlaceKind.STACK, player });
const pocket = (player: number, number: number): ChipPlace => ({ kind: ChipPlaceKind.POCKET, player, pocket: number });

/** The chips of the bets a player placed, from its stack to each pocket it covered */
export function betTransfers(player: number, bets: Bets): ReadonlyArray<Readonly<ChipTransfer>> {
    return bets.flatMap((amount: number, index: number) => amount > 0 ? [{ from: stack(player), to: pocket(player, index + 1), amount }] : []);
}

/** The chips of a game void, a player forfeiting the match: the bets on the table back to their owners */
export function voidTransfers(bets: PlacedBets, croupier: number): ReadonlyArray<Readonly<ChipTransfer>> {
    return [Side.CROUPIER, Side.PUNTER].flatMap((side: Side) => {
        const player: number = side === Side.CROUPIER ? croupier : 1 - croupier;
        return backTransfers(player, bets[side] ?? []);
    });
}

/**
 * The chips of a game settled: the chips on the pocket of the ball back to their owners, then the chips of the other
 * pockets, pocket by pocket, to the players taking them, the croupier first, else to the bank. A split pours them into
 * the share of the croupier, then into the one of the punter: a stake may fly to both
 */
export function settlementTransfers(event: Readonly<SettledEvent>): ReadonlyArray<Readonly<ChipTransfer>> {
    const { ball, bets, settlement } = event;
    const playerOf = (side: Side): number => side === Side.CROUPIER ? event.croupier : 1 - event.croupier;
    const sides: ReadonlyArray<Side> = [Side.CROUPIER, Side.PUNTER];
    const back: ReadonlyArray<Readonly<ChipTransfer>> = sides.flatMap((side: Side) =>
        backTransfers(playerOf(side), bets[side].map((amount: number, index: number) => index + 1 === ball ? amount : 0)));
    // What each taker receives of the chips lost, in the order they are poured
    const takers: Array<{ place: ChipPlace; left: number }> = [
        ...sides.map((side: Side) => ({ place: stack(playerOf(side)), left: settlement.won[side] })),
        { place: BANK, left: settlement.bank },
    ];
    const lost: ReadonlyArray<Readonly<ChipTransfer>> = sides.flatMap((side: Side) => bets[side].flatMap((amount: number, index: number) =>
        index + 1 === ball ? [] : pour(pocket(playerOf(side), index + 1), amount, takers)));

    return [...back, ...lost];
}

/** The chips of a player on pockets back to its stack */
function backTransfers(player: number, bets: Bets): ReadonlyArray<Readonly<ChipTransfer>> {
    return bets.flatMap((amount: number, index: number) => amount > 0 ? [{ from: pocket(player, index + 1), to: stack(player), amount }] : []);
}

/** The chips of a stake poured into the takers, each one until it received its part */
function pour(from: ChipPlace, amount: number, takers: Array<{ place: ChipPlace; left: number }>): ReadonlyArray<Readonly<ChipTransfer>> {
    const transfers: ChipTransfer[] = [];
    let rest: number = amount;

    for (const taker of takers) {
        const poured: number = Math.min(rest, taker.left);
        if (poured > 0) {
            transfers.push({ from, to: taker.place, amount: poured });
            taker.left -= poured;
            rest -= poured;
        }
    }
    return transfers;
}
