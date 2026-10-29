import { Block } from './block';
import { SequencerClock } from './sequencer-clock';
import { describe, expect, test } from 'vitest';

const tolerance: number = SequencerClock.TOLERANCE_MS;

function block(sequencer: string, time: number): Block {
    return new Block(1, 'previous', { id: 'id', data: { from: 'b', type: 'move', payload: 1 }, signature: '' }, sequencer, time, 'hash', '');
}

describe('SequencerClock', () => {
    test('should compare the delay of each block with the one of the first block of its sequencer', () => {
        // Given: the first block is received 2 seconds after its time
        const clock: SequencerClock = new SequencerClock();
        clock.isAhead(block('b', 10_000), 12_000);

        // When / Then
        expect(clock.isAhead(block('b', 20_000), 30_000)).toEqual(false);
        expect(clock.isAhead(block('b', 30_000), 32_000 - tolerance)).toEqual(false);
        expect(clock.isAhead(block('b', 40_000), 42_000 - tolerance - 1)).toEqual(true);
    });

    test('should tell a clock ahead once per sequencer', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        clock.isAhead(block('b', 10_000), 10_000);
        clock.isAhead(block('b', 20_000), 10_000);

        // When
        const again: boolean = clock.isAhead(block('b', 30_000), 10_000);
        const newSequencer: boolean = clock.isAhead(block('c', 60_000), 10_000);
        const newSequencerAhead: boolean = clock.isAhead(block('c', 70_000), 10_000);

        // Then: the first block of a new sequencer starts its watch
        expect(again).toEqual(false);
        expect(newSequencer).toEqual(false);
        expect(newSequencerAhead).toEqual(true);
    });

    test('clear should forget the sequencer watched', () => {
        // Given
        const clock: SequencerClock = new SequencerClock();
        clock.isAhead(block('b', 10_000), 10_000);
        clock.isAhead(block('b', 20_000), 10_000);

        // When
        clock.clear();

        // Then
        expect(clock.isAhead(block('b', 30_000), 10_000)).toEqual(false);
        expect(clock.isAhead(block('b', 40_000), 10_000)).toEqual(true);
    });
});
