import { SeatPair } from '@app/helpers/seat-pair.helper';
import { Bets, FixedRouletteRules, Side, totalOf } from './fixed-roulette-rules';

/** Who the ball pays */
export enum SettlementCase {
    /** The croupier alone bet on the pocket of the ball */
    CROUPIER = 'croupier',
    /** The punter alone bet on the pocket of the ball */
    PUNTER = 'punter',
    /** Both sides bet on the pocket of the ball: they share the chips of the other pockets */
    SPLIT = 'split',
    /** No side bet on the pocket of the ball: the bank takes every chip bet */
    BANK = 'bank',
}

/** The bets of both sides in a game */
export type GameBets = Readonly<Record<Side, Bets>>;

/** The bets of both sides while they are placed: none for a side yet to bet */
export type PlacedBets = Readonly<Record<Side, Bets | null>>;

/** Where the chips bet in a game go once the ball is revealed */
export interface Settlement {
    readonly kind: SettlementCase;
    /** The chips of each side on the pocket of the ball, back to it */
    readonly back: Readonly<Record<Side, number>>;
    /** The chips of the other pockets each side takes, the leftover chip of a split included */
    readonly won: Readonly<Record<Side, number>>;
    /** The chips the bank takes */
    readonly bank: number;
}

const sides = (croupier: number, punter: number): Readonly<Record<Side, number>> => ({ [Side.CROUPIER]: croupier, [Side.PUNTER]: punter });
/** The integer quotient, exact: no floating division rounds a share otherwise on a page */
const quotient = (dividend: number, divisor: number): number => (dividend - dividend % divisor) / divisor;

/**
 * Where the chips bet go once the ball is revealed: every chip on its pocket goes back to its owner. One side alone on it
 * takes the chips of the other pockets; both sides on it share them in the ratio of their chips on it, each share
 * floored, the leftover chip to the punter; no side on it, the bank takes every chip bet
 *
 * @param ball the pocket of the ball, numbered from 1
 */
export function settle(bets: GameBets, ball: number): Settlement {
    const croupier: number = bets[Side.CROUPIER][ball - 1];
    const punter: number = bets[Side.PUNTER][ball - 1];
    const lost: number = totalOf(bets[Side.CROUPIER]) + totalOf(bets[Side.PUNTER]) - croupier - punter;
    const back: Readonly<Record<Side, number>> = sides(croupier, punter);

    if (croupier === 0 && punter === 0) {
        return { kind: SettlementCase.BANK, back, won: sides(0, 0), bank: lost };
    }
    if (punter === 0) {
        return { kind: SettlementCase.CROUPIER, back, won: sides(lost, 0), bank: 0 };
    }
    if (croupier === 0) {
        return { kind: SettlementCase.PUNTER, back, won: sides(0, lost), bank: 0 };
    }

    const croupierShare: number = quotient(lost * croupier, croupier + punter);
    // The punter takes the rest: its floored share and the chip the floored shares leave
    return { kind: SettlementCase.SPLIT, back, won: sides(croupierShare, lost - croupierShare), bank: 0 };
}

/** The chips a side gets back from the table: its chips on the pocket of the ball and the ones it takes */
export function payoutOf(settlement: Readonly<Settlement>, side: Side): number {
    return settlement.back[side] + settlement.won[side];
}

/** What a side won, or lost below 0, in the game */
export function netOf(settlement: Readonly<Settlement>, bets: GameBets, side: Side): number {
    return payoutOf(settlement, side) - totalOf(bets[side]);
}

/**
 * The chips of each player on each pocket, the first pocket first, for the table: a side yet to bet has none
 *
 * @param croupier the croupier of the game: the other player is the punter
 */
export function pocketStakes(rules: FixedRouletteRules, bets: PlacedBets, croupier: number): ReadonlyArray<SeatPair<number>> {
    return Array.from({ length: rules.pockets }, (_, index: number): SeatPair<number> => {
        const croupierChips: number = bets[Side.CROUPIER]?.[index] ?? 0;
        const punterChips: number = bets[Side.PUNTER]?.[index] ?? 0;
        return croupier === 0 ? [croupierChips, punterChips] : [punterChips, croupierChips];
    });
}
