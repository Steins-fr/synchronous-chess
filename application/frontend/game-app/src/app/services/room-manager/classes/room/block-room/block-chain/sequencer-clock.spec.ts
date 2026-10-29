import { Block } from './block';
import { SequencerClock } from './sequencer-clock';
import { describe, expect, test } from 'vitest';

const tolerance: number = SequencerClock.TOLERANCE_MS;
const warmUp: number = SequencerClock.WARM_UP_BLOCKS;

function block(sequencer: string, time: number): Block {
    return new Block(1, 'previous', { id: 'id', data: { from: 'b', type: 'move', payload: 1 }, signature: '' }, sequencer, time, 'hash', '');
}

/** The first blocks of a sequencer, received at their time but the first one, late */
function warmUpClock(clock: SequencerClock, sequencer: string = 'b', firstDelay: number = 0): void {
    clock.isAhead(block(sequencer, 0), firstDelay);
    for (let index = 1; index < warmUp; index++) {
        clock.isAhead(block(sequencer, index * 1000), index * 1000);
    }
}

describe('SequencerClock', () => {
    test('should compare the delay of each block with the shortest one of the first blocks of its sequencer', () => {
        // Given: the first block received 10 seconds late, as by a page suspended
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock, 'b', 10_000);

        // When / Then
        expect(clock.isAhead(block('b', 20_000), 30_000)).toEqual(false);
        expect(clock.isAhead(block('b', 30_000), 30_000 - tolerance)).toEqual(false);
        expect(clock.isAhead(block('b', 40_000), 40_000 - tolerance - 1)).toEqual(true);
    });

    test('should not tell a clock ahead during the first blocks of a sequencer', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        clock.isAhead(block('b', 0), 0);

        // When
        const ahead: boolean[] = Array.from({ length: warmUp - 1 }, (_, index: number) => clock.isAhead(block('b', (index + 1) * 60_000), 0));

        // Then
        expect(ahead.some(Boolean)).toEqual(false);
    });

    test('should tell a clock ahead once per sequencer', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock);
        clock.isAhead(block('b', 60_000), 10_000);

        // When
        const again: boolean = clock.isAhead(block('b', 70_000), 10_000);
        warmUpClock(clock, 'c');
        const newSequencerAhead: boolean = clock.isAhead(block('c', 60_000), 10_000);

        // Then: the first blocks of a new sequencer start its watch
        expect(again).toEqual(false);
        expect(newSequencerAhead).toEqual(true);
    });

    test('clear should forget the sequencer watched', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        warmUpClock(clock);
        clock.isAhead(block('b', 60_000), 10_000);

        // When
        clock.clear();

        // Then
        expect(clock.isAhead(block('b', 70_000), 10_000)).toEqual(false);
    });
});
