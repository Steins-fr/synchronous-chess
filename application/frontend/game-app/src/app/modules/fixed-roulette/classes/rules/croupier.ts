import { SeededRandom } from '@app/modules/commit-reveal/classes/seeded-random';
import { FixedRouletteRules } from './fixed-roulette-rules';

/** The croupier of the first game of a match, drawn alike on every page from the seed of the match: no player chose it */
export async function drawCroupier(seed: string, rules: FixedRouletteRules): Promise<number> {
    return new SeededRandom(`${ seed }:croupier`).below(rules.seats);
}
