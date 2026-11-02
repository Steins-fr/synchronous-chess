import { CryptoHelper } from '@app/helpers/crypto.helper';
import { commitmentOf, drawSalt, isCommitment } from './commitment';

/** What a message of a draw did */
export enum DrawStep {
    APPLIED = 'applied',
    /** Out of its phase, from a participant not drawing, or a second one of a player: the first one counts */
    IGNORED = 'ignored',
    /** A malformed commitment, or a random part not matching its commitment: the game reports the cheat */
    INVALID = 'invalid',
}

export enum DrawPhase {
    /** The players commit to their random parts */
    COMMITTING = 'committing',
    /** Every player committed: they reveal their parts */
    REVEALING = 'revealing',
    /** Every part revealed: the seed is drawn */
    DRAWN = 'drawn',
}

/**
 * A random seed no player chose alone: each player commits to a random part of its own, then reveals it once every
 * player committed, the seed being the hash of every part. A player can not change its part once it saw the others.
 *
 * The messages apply one after the other, in the order of the chain: every participant draws the same seed.
 */
export class FairDraw {
    private readonly commitments = new Map<string, string>();
    private readonly parts = new Map<string, string>();

    /**
     * @param context unique to the draw: a commitment to another draw is no commitment here
     * @param players the players drawing, in the order of their seats: the order of the parts in the seed
     */
    public constructor(public readonly context: string, public readonly players: ReadonlyArray<string>) {
        if (new Set(players).size !== players.length) {
            throw new Error('A fair draw needs distinct players');
        }
    }

    /** The random part of the local player, kept secret until every player committed */
    public static drawPart(): string {
        return drawSalt();
    }

    /** The commitment of the player of a seat to its random part */
    public static commitment(context: string, seat: number, part: string): Promise<string> {
        return commitmentOf([context, seat, part], ':');
    }

    public get phase(): DrawPhase {
        if (this.commitments.size < this.players.length) {
            return DrawPhase.COMMITTING;
        }
        return this.parts.size < this.players.length ? DrawPhase.REVEALING : DrawPhase.DRAWN;
    }

    /** The players the draw waits for: to commit, then to reveal */
    public get waitingFor(): ReadonlyArray<string> {
        switch (this.phase) {
            case DrawPhase.COMMITTING:
                return this.players.filter((player: string) => !this.commitments.has(player));
            case DrawPhase.REVEALING:
                return this.players.filter((player: string) => !this.parts.has(player));
            case DrawPhase.DRAWN:
                return [];
        }
    }

    public commit(player: string, commitment: unknown): DrawStep {
        if (this.phase !== DrawPhase.COMMITTING || !this.players.includes(player) || this.commitments.has(player)) {
            return DrawStep.IGNORED;
        }
        if (!isCommitment(commitment)) {
            return DrawStep.INVALID;
        }

        this.commitments.set(player, commitment);
        return DrawStep.APPLIED;
    }

    /** A part not matching its commitment is not kept: a later reveal of the player may still match */
    public async reveal(player: string, part: unknown): Promise<DrawStep> {
        if (this.phase !== DrawPhase.REVEALING || !this.players.includes(player) || this.parts.has(player)) {
            return DrawStep.IGNORED;
        }
        if (typeof part !== 'string' || await FairDraw.commitment(this.context, this.players.indexOf(player), part) !== this.commitments.get(player)) {
            return DrawStep.INVALID;
        }

        this.parts.set(player, part);
        return DrawStep.APPLIED;
    }

    /** The hash of every part, in the order of the seats, once every part is revealed */
    public async seed(): Promise<string | undefined> {
        if (this.phase !== DrawPhase.DRAWN) {
            return undefined;
        }
        return await CryptoHelper.sha256(this.players.map((player: string) => this.parts.get(player)).join(':'));
    }
}
