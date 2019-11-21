export enum FenColumn {
    A = 'a',
    B = 'b',
    C = 'c',
    D = 'd',
    E = 'e',
    F = 'f',
    G = 'g',
    H = 'h'
}

export type FenRow = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type FenCoordinate = [FenColumn, FenRow];

export default interface Move {
    from: FenCoordinate;
    to: FenCoordinate;
}
