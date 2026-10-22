/** The seats of the two players: the index of each in the pairs of values of a hand (stacks, bets...) */
export enum PokerSeat {
    ONE = 0,
    TWO = 1,
}

export const otherSeat = (seat: PokerSeat): PokerSeat => seat === PokerSeat.ONE ? PokerSeat.TWO : PokerSeat.ONE;

/** A value for each seat, read by the seat */
export type SeatPair<T> = readonly [T, T];

/** The pair changed for a seat only */
export const withSeat = <T>(pair: SeatPair<T>, seat: PokerSeat, value: T): SeatPair<T> => seat === PokerSeat.ONE ? [value, pair[1]] : [pair[0], value];
