import { describe, expect, test } from 'vitest';
import { idGenerator } from '@app/helpers/id-generator.helper';

describe('idGenerator', () => {
    test('should yield incremental ids starting at 1', () => {
        // Given
        const ids: Generator<number, never> = idGenerator();

        // When / Then
        expect(ids.next().value).toEqual(1);
        expect(ids.next().value).toEqual(2);
        expect(ids.next().value).toEqual(3);
    });

    test('should yield independent sequences', () => {
        // Given
        const first: Generator<number, never> = idGenerator();
        const second: Generator<number, never> = idGenerator();

        // When
        first.next();

        // Then
        expect(second.next().value).toEqual(1);
    });
});
