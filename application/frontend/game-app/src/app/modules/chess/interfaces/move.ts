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

export enum FenRow {
    _1 = 1,
    _2 = 2,
    _3 = 3,
    _4 = 4,
    _5 = 5,
    _6 = 6,
    _7 = 7,
    _8 = 8
}

export type FenCoordinate = [FenColumn, FenRow];

export default interface Move {
    from: FenCoordinate;
    to: FenCoordinate;
}
