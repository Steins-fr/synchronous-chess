/**
 * Endless sequence of ids starting at 1
 */
export function* idGenerator(): Generator<number, never> {
    let id: number = 0;
    while (true) {
        ++id;
        yield id;
    }
}
