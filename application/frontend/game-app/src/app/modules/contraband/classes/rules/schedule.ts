import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';

/** A game of the match: a smuggler of a country, the inspector of the other one */
export interface Crossing {
    /** The indexes of the players, in the order of their seats: the North ones first */
    readonly smuggler: number;
    readonly inspector: number;
}

/**
 * The games of a match, drawn alike on every page from the seed of the match: no player chose its opponents.
 *
 * Each rotation shuffles the South players apart, from `seed:pairing:rotation`: then, for each North player in its
 * order, it smuggles across the customs of its South player, then the South player across its customs. A rotation holds
 * 2 games per pair; the match stops after its games, in a rotation too: some players may smuggle once more than others
 *
 * @param north the players of each country
 * @param games the games of the match
 */
export async function drawSchedule(seed: string, north: number, games: number): Promise<ReadonlyArray<Readonly<Crossing>>> {
    const south: ReadonlyArray<number> = Array.from({ length: north }, (_, index: number) => north + index);
    const rotations: ReadonlyArray<ReadonlyArray<number>> = await Promise.all(Array.from({ length: Math.ceil(games / (2 * north)) },
        (_, rotation: number) => new SeededRandom(`${ seed }:pairing:${ rotation }`).shuffle(south)));

    return rotations
        .flatMap((pairing: ReadonlyArray<number>) => pairing.flatMap((southPlayer: number, northPlayer: number): Crossing[] => [
            { smuggler: northPlayer, inspector: southPlayer },
            { smuggler: southPlayer, inspector: northPlayer },
        ]))
        .slice(0, games);
}
