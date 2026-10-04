import { Injector, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';
import { describe, expect, test } from 'vitest';
import { requiredText } from './required-text.rule';

describe('requiredText', () => {
    function nameForm(name: WritableSignal<string>): FieldTree<string> {
        return form(name, (path) => {
            requiredText(path, 'Le nom est requis');
        }, { injector: TestBed.inject(Injector) });
    }

    test.each<[string, string]>([
        ['an empty text', ''],
        ['a text of spaces only', '   '],
    ])('should reject %s, with its message', (_case: string, value: string) => {
        // When
        const field: FieldTree<string> = nameForm(signal(value));

        // Then
        expect(field().required()).toEqual(true);
        expect(field().invalid()).toEqual(true);
        expect(field().errors().map((error) => error.message)).toEqual(['Le nom est requis']);
    });

    test('should accept a text', () => {
        // When
        const field: FieldTree<string> = nameForm(signal(' Alice '));

        // Then
        expect(field().valid()).toEqual(true);
    });
});
