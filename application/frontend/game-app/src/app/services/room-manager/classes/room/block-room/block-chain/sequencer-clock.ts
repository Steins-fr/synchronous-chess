import { Block } from './block';

/**
 * Watches the clock of the sequencer on the blocks it sends live: running ahead of the clock of this participant, it
 * would spread the times of blocks ordered at once, a flood of messages looking slow to the rules reading them.
 *
 * The delay of a block, from its time to its reception, is the gap between the two clocks plus the network: much
 * shorter than the delay of the first block of the sequencer, its clock ran ahead. Its clock running late is not
 * told apart from a slow network
 */
export class SequencerClock {
    /** The clock of the sequencer may run ahead by this much, the first block of the sequencer late on the network included */
    public static readonly TOLERANCE_MS: number = 5000;

    private sequencer?: string;
    /** The delay of the first block of the sequencer, the others compared with it */
    private firstDelay: number = 0;
    /** Reported once: the participant accuses the sequencer, its next blocks add nothing */
    private reported: boolean = false;

    /** @returns whether the clock of the sequencer of the block ran ahead, once per sequencer */
    public isAhead(block: Block, receivedAt: number): boolean {
        const delay: number = receivedAt - block.time;

        if (block.sequencer !== this.sequencer) {
            this.sequencer = block.sequencer;
            this.firstDelay = delay;
            this.reported = false;
            return false;
        }

        if (this.reported || delay >= this.firstDelay - SequencerClock.TOLERANCE_MS) {
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
