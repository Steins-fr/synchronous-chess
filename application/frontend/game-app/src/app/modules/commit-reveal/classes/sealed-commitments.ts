/**
 * The commitments of the players, by round, in the order of the chain: the first commitment of a player for a round
 * counts, a player can not change its value once committed. A round is known by its text, `1` and `'1'` being one
 * round, as a payload may carry either.
 */
export class SealedCommitments<Round extends string | number> {
    private readonly rounds = new Map<string, Map<string, string>>();

    /** @returns whether the commitment counts: not when the player committed to the round already */
    public record(round: Round, player: string, commitment: string): boolean {
        const key: string = String(round);
        const commitments: Map<string, string> = this.rounds.get(key) ?? new Map<string, string>();

        if (commitments.has(player)) {
            return false;
        }

        commitments.set(player, commitment);
        this.rounds.set(key, commitments);
        return true;
    }

    public get(round: Round, player: string): string | undefined {
        return this.rounds.get(String(round))?.get(player);
    }

    public has(round: Round, player: string): boolean {
        return this.get(round, player) !== undefined;
    }

    /** Whether every player committed to the round: then each one reveals */
    public hasAll(round: Round, players: ReadonlyArray<string>): boolean {
        return players.every((player: string) => this.has(round, player));
    }
}
