import { SealedCommitments } from './sealed-commitments';
import { describe, expect, test } from 'vitest';

describe('SealedCommitments', () => {
    test('should keep the first commitment of a player for a round', () => {
        // Given
        const commitments = new SealedCommitments<number>();

        // When
        const first: boolean = commitments.record(0, 'a', 'one');
        const second: boolean = commitments.record(0, 'a', 'two');

        // Then
        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(commitments.get(0, 'a')).toEqual('one');
        expect(commitments.has(0, 'a')).toBe(true);
        expect(commitments.has(0, 'b')).toBe(false);
        expect(commitments.get(1, 'a')).toBeUndefined();
    });

    test('should know a round by its text', () => {
        // Given
        const commitments = new SealedCommitments<number | string>();
        commitments.record(1, 'a', 'one');

        // Then
        expect(commitments.record('1', 'a', 'two')).toBe(false);
        expect(commitments.get('1', 'a')).toEqual('one');
    });

    test('should tell when every player of a round committed', () => {
        // Given
        const commitments = new SealedCommitments<number>();
        commitments.record(0, 'a', 'one');

        // Then
        expect(commitments.hasAll(0, ['a', 'b'])).toBe(false);
        expect(commitments.hasAll(0, ['a'])).toBe(true);
        expect(commitments.hasAll(0, [])).toBe(true);
    });
});
