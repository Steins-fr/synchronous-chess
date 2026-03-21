export class InvalidFenCoordinateError extends Error {
    public constructor(type: 'column' | 'row', index: number | string) {
        super(`Invalid ${type} index: ${index}`);
    }
}
