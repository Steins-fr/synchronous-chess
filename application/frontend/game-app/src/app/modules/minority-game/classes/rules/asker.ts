import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';

/** A question waiting for its asker: the players who may be drawn */
export interface AskerDraw {
    /** The index of the question */
    readonly round: number;
    /** The askers drawn for the question before: one late gives way to another */
    readonly ask: number;
    readonly candidates: ReadonlyArray<number>;
}

/** The asker of a question, drawn alike on every page from the seed of the game: no player chose it */
export async function drawAsker(seed: string, draw: Readonly<AskerDraw>): Promise<number> {
    return draw.candidates[await new SeededRandom(`${ seed }:asker:${ draw.round }:${ draw.ask }`).below(draw.candidates.length)];
}
