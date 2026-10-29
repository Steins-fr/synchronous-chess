import { Block } from './block';
import { Reception, SequencerClock } from './sequencer-clock';
import { describe, expect, test } from 'vitest';

const tolerance: number = SequencerClock.TOLERANCE_MS;
const warmUp: number = SequencerClock.WARM_UP_BLOCKS;
// The first blocks spread over the warm-up, the next ones from this time
const later: number = 100_000;

function block(sequencer: string, time: number): Block {
    return new Block(1, 'previous', { id: 'id', data: { from: 'b', type: 'move', payload: 1 }, signature: '' }, sequencer, time, 'hash', '');
}

function at(time: number, systemGap: number = 0): Reception {
    return { at: time, systemGap };
}

/** The first blocks of a sequencer over the warm-up, received at their time but the first one, late */
function warmUpClock(clock: SequencerClock, sequencer: string = 'b', firstDelay: number = 0): void {
    const step: number = SequencerClock.WARM_UP_MS / (warmUp - 1);
    clock.isAhead(block(sequencer, 0), at(firstDelay));
    for (let index = 1; index < warmUp; index++) {
        clock.isAhead(block(sequencer, index * step), at(index * step));
    }
}

describe('SequencerClock', () => {
    test('should time the blocks by the time of the system at the start of the page, then a monotonic clock', () => {
        // When
        const now: number = SequencerClock.now();

        // Then
        expect(now).toBeGreaterThanOrEqual(performance.timeOrigin);
        expect(Math.abs(now - Date.now())).toBeLessThan(1000);
    });

    test('should compare the delay of each block with the shortest one of the first blocks of its sequencer', () => {
        // Given: the first block received 10 seconds late, as by a page suspended
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock, 'b', 10_000);

        // When / Then
        expect(clock.isAhead(block('b', later), at(later + 10_000))).toEqual(false);
        expect(clock.isAhead(block('b', later + 10_000), at(later + 10_000 - tolerance))).toEqual(false);
        expect(clock.isAhead(block('b', later + 20_000), at(later + 20_000 - tolerance - 1))).toEqual(true);
    });

    test('should not tell a clock ahead during the first blocks of a sequencer, nor its first seconds', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        clock.isAhead(block('b', 0), at(0));

        // When: more blocks than the warm-up, within its seconds
        const ahead: boolean[] = Array.from({ length: 2 * warmUp }, (_, index: number) => clock.isAhead(block('b', (index + 1) * 60_000), at(index * 1000)));

        // Then
        expect(ahead.some(Boolean)).toEqual(false);
    });

    test('should start again once the clock of the system moved apart from the clock of the blocks', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock);

        // When: the page slept, its monotonic clock stopped meanwhile
        const asleep: boolean = clock.isAhead(block('b', later + 60_000), at(later, 60_000));

        // Then
        expect(asleep).toEqual(false);
        expect(clock.isAhead(block('b', later + 70_000), at(later + 10_000, 60_000))).toEqual(false);
    });

    test('should tell a clock ahead once per sequencer', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock);
        clock.isAhead(block('b', later + 60_000), at(later));

        // When
        const again: boolean = clock.isAhead(block('b', later + 70_000), at(later));
        warmUpClock(clock, 'c');
        const newSequencerAhead: boolean = clock.isAhead(block('c', later + 60_000), at(later));

        // Then: the first blocks of a new sequencer start its watch
        expect(again).toEqual(false);
        expect(newSequencerAhead).toEqual(true);
    });

    test('clear should forget the sequencer watched', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock);
        clock.isAhead(block('b', later + 60_000), at(later));

        // When
        clock.clear();

        // Then
        expect(clock.isAhead(block('b', later + 70_000), at(later))).toEqual(false);
    });
});
