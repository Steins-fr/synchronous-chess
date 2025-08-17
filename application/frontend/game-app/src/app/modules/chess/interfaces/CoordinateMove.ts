export enum Row {
    _8 = 0,
    _7 = 1,
    _6 = 2,
    _5 = 3,
    _4 = 4,
    _3 = 5,
    _2 = 6,
    _1 = 7
}

export enum Column {
    A = 0,
    B = 1,
    C = 2,
    D = 3,
    E = 4,
    F = 5,
    G = 6,
    H = 7
}

export type Coordinate = [Column, Row];

export default interface CoordinateMove {
    from: Coordinate;
    to: Coordinate;
}
