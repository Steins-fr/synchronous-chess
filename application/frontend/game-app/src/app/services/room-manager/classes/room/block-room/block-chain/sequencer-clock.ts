import { Block } from './block';

/** When a block was received, by the clock of the blocks, and the gap from it to the clock of the system then */
export interface Reception {
    readonly at: number;
    readonly systemGap: number;
}

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
     * The first blocks of a sequencer, over its first seconds, only set the delay the next ones are compared with, the
     * shortest of theirs: some of them late, received by a page suspended or busy, or over a slow network, do not make an
     * honest sequencer look ahead
     */
    public static readonly WARM_UP_BLOCKS: number = 5;
    public static readonly WARM_UP_MS: number = 30_000;

    private sequencer?: string;
    /** The live blocks of the sequencer received since the watch started */
    private blocks: number = 0;
    private warmUpStart: number = 0;
    /** The shortest delay of the first blocks of the sequencer, the next ones compared with it */
    private shortestDelay: number = 0;
    /** The gap from the clock of the blocks to the clock of the system, at the latest block */
    private systemGap: number = 0;
    /** Reported once: the participant accuses the sequencer, its next blocks add nothing */
    private reported: boolean = false;

    /**
     * The clock the blocks are timed with: the time of the system once the page started, then a monotonic one, so that a
     * clock of the system set, by the network or after a sleep, does not make the times of the blocks jump
     */
    public static now(): number {
        return performance.timeOrigin + performance.now();
    }

    /** @returns whether the clock of the sequencer of the block jumped ahead, once per sequencer */
    public isAhead(block: Block, reception: Reception): boolean {
        const delay: number = reception.at - block.time;

        // A clock of this participant stopping, the page asleep, or the clock of its system set: the watch starts again
        if (block.sequencer !== this.sequencer || Math.abs(reception.systemGap - this.systemGap) > SequencerClock.TOLERANCE_MS) {
            this.sequencer = block.sequencer;
            this.blocks = 0;
            this.warmUpStart = reception.at;
            this.shortestDelay = delay;
            this.reported = false;
        }
        this.systemGap = reception.systemGap;

        this.blocks++;
        if (this.blocks <= SequencerClock.WARM_UP_BLOCKS || reception.at - this.warmUpStart < SequencerClock.WARM_UP_MS) {
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
