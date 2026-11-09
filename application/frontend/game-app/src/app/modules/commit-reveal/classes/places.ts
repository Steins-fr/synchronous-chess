/** The place of each key, the highest first: 1 plus the keys above it, equal keys sharing a place */
export function placesOf(keys: ReadonlyArray<number>): number[] {
    return keys.map((key: number) => 1 + keys.filter((other: number) => other > key).length);
}
