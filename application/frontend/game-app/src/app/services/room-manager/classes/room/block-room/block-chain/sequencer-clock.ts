import { Block } from './block';

/**
 * Watches the clock of the sequencer on the blocks it sends live: running ahead of the clock of this participant, it
 * would spread the times of blocks ordered at once, a flood of messages looking slow to the rules reading them.
 *
 * The delay of a block, from its time to its reception, is the gap between the two clocks plus the network, which only
 * makes it longer: much shorter than the shortest delay of the first blocks of the sequencer, its clock jumped ahead.
 * A clock ahead from the first blocks on, or running late, is not told apart from a slow network
 */
export class SequencerClock {
    /** The clock of the sequencer may jump ahead by this much, in milliseconds */
    public static readonly TOLERANCE_MS: number = 5000;
    /**
     * The first blocks of a sequencer only set the delay the next ones are compared with, the shortest of theirs: one of
     * them late, received by a page suspended or over a slow network, does not make an honest sequencer look ahead
     */
    public static readonly WARM_UP_BLOCKS: number = 5;

    private sequencer?: string;
    /** The live blocks of the sequencer received */
    private blocks: number = 0;
    /** The shortest delay of the first blocks of the sequencer, the next ones compared with it */
    private shortestDelay: number = 0;
    /** Reported once: the participant accuses the sequencer, its next blocks add nothing */
    private reported: boolean = false;

    /** @returns whether the clock of the sequencer of the block jumped ahead, once per sequencer */
    public isAhead(block: Block, receivedAt: number): boolean {
        const delay: number = receivedAt - block.time;

        if (block.sequencer !== this.sequencer) {
            this.sequencer = block.sequencer;
            this.blocks = 0;
            this.shortestDelay = delay;
            this.reported = false;
        }

        this.blocks++;
        if (this.blocks <= SequencerClock.WARM_UP_BLOCKS) {
            this.shortestDelay = Math.min(this.shortestDelay, delay);
            return false;
        }

        if (this.reported || delay >= this.shortestDelay - SequencerClock.TOLERANCE_MS) {
            return false;
        }

        this.reported = true;
        return true;
    }

    public clear(): void {
        this.sequencer = undefined;
        this.reported = false;
    }
}
