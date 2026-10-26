/** The seats of a table of two players: the index of each in the pairs of values of a game (stacks, bets, deaths...) */
export enum TableSeat {
    ONE = 0,
    TWO = 1,
}

export const otherSeat = (seat: TableSeat): TableSeat => seat === TableSeat.ONE ? TableSeat.TWO : TableSeat.ONE;

/** A value for each seat, read by the seat */
export type SeatPair<T> = readonly [T, T];

/** The pair changed for a seat only */
export const withSeat = <T>(pair: SeatPair<T>, seat: TableSeat, value: T): SeatPair<T> => seat === TableSeat.ONE ? [value, pair[1]] : [pair[0], value];
