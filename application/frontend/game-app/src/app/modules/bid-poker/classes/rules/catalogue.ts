import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';
import { BidPokerRules } from './bid-poker-rules';

/** The letter of a lot: A, B, C... */
export function lotLetter(index: number): string {
    return String.fromCodePoint('A'.codePointAt(0) as number + index);
}

/** Every way to split a count of cards into lots of these sizes: the sizes of each way, from the smallest */
export function lotCompositions(total: number, sizes: ReadonlyArray<number>): ReadonlyArray<ReadonlyArray<number>> {
    const [size, ...others] = sizes;

    if (size === undefined) {
        return total === 0 ? [[]] : [];
    }

    return Array.from({ length: Math.floor(total / size) + 1 }, (_, count: number) => count)
        .flatMap((count: number) => lotCompositions(total - count * size, others)
            .map((rest: ReadonlyArray<number>) => [...Array.from({ length: count }, () => size), ...rest]));
}

/**
 * The lots of the dealing session, drawn from the seed of the fair draw alike on every page: the deck shuffled, a way
 * to split it drawn, the order of its sizes shuffled, then the deck cut into lots
 */
export async function drawCatalogue(seed: string, rules: BidPokerRules): Promise<ReadonlyArray<ReadonlyArray<number>>> {
    const compositions: ReadonlyArray<ReadonlyArray<number>> = lotCompositions(rules.deck.length, rules.lotSizes);

    if (compositions.length === 0) {
        throw new Error(`No lots of ${ rules.lotSizes.join(' or ') } cards make a deck of ${ rules.deck.length }`);
    }

    const deck: number[] = await new SeededRandom(`${ seed }:deck`).shuffle(rules.deck.map((_, id: number) => id));
    const composition: ReadonlyArray<number> = compositions[await new SeededRandom(`${ seed }:lots`).below(compositions.length)];
    const sizes: number[] = await new SeededRandom(`${ seed }:sizes`).shuffle(composition);

    return sizes.map((size: number, index: number) => {
        const start: number = sizes.slice(0, index).reduce((sum: number, previous: number) => sum + previous, 0);
        return deck.slice(start, start + size);
    });
}
