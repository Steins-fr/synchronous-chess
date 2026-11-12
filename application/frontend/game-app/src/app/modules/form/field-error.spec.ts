import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, min, required, submit, validate } from '@angular/forms/signals';
import { describe, expect, test } from 'vitest';
import { touchedError } from './field-error';

describe('touchedError', () => {
    test('should tell the first error among the fields touched of a group, the group included', async () => {
        // Given
        const bets = signal<{ pocket: string; chips: { one: number; two: number } }>({ pocket: '', chips: { one: 0, two: 0 } });
        const betsForm = TestBed.runInInjectionContext(() => form(bets, (path) => {
            required(path.pocket, { message: 'bets.pocket' });
            min(path.chips.one, 0, { message: 'bets.negative' });
            validate(path.chips, ({ value }) => value().one + value().two > 0 ? undefined : { kind: 'none', message: 'bets.none', least: 1 });
        }, { name: 'bets' }));

        // Then no field is touched
        expect(touchedError(betsForm)).toBeUndefined();

        // When a stake is touched, the pocket not yet
        betsForm.chips.one().markAsTouched();

        // Then the error of the group of the stakes, with its values, not the one of the pocket
        expect(touchedError(betsForm)).toEqual({ key: 'bets.none', params: expect.objectContaining({ kind: 'none', least: 1 }) });

        // When
        bets.set({ pocket: '', chips: { one: -2, two: 5 } });

        // Then
        expect(touchedError(betsForm)?.key).toEqual('bets.negative');

        // When every field is touched
        await submit(betsForm, { action: () => Promise.resolve() });

        // Then
        expect(touchedError(betsForm)?.key).toEqual('bets.pocket');

        // When
        bets.set({ pocket: '2', chips: { one: 2, two: 5 } });

        // Then
        expect(touchedError(betsForm)).toBeUndefined();
    });
});
