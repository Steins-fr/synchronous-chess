import { Injector, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';
import { describe, expect, test } from 'vitest';
import { noLink } from './no-link.rule';

describe('noLink', () => {
    function textForm(text: WritableSignal<string>): FieldTree<string> {
        return form(text, (path) => {
            noLink(path, 'composer.link');
        }, { injector: TestBed.inject(Injector) });
    }

    test.each<[string, string]>([
        ['a link', 'Did you see www.example.com?'],
        ['an e-mail address', 'Write to alice@example.com'],
    ])('should reject %s, with its message', (_case: string, value: string) => {
        // When
        const field: FieldTree<string> = textForm(signal(value));

        // Then
        expect(field().errors().map((error) => [error.kind, error.message])).toEqual([['link', 'composer.link']]);
    });

    test('should accept a text without link', () => {
        // When
        const field: FieldTree<string> = textForm(signal('Do you like rain?'));

        // Then
        expect(field().valid()).toEqual(true);
    });
});
