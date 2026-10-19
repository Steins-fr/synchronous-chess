import { describe, expect, test } from 'vitest';
import { textFieldInput } from './text-field.helper';

describe('textFieldInput', () => {
    const root: HTMLElement = document.createElement('div');
    root.innerHTML = `
        <app-text-field><mat-label>Room name</mat-label><input id="room"></app-text-field>
        <app-text-field><mat-label> Player name </mat-label><input id="player"></app-text-field>`;

    test('should find the input of the text field by its label', () => {
        expect(textFieldInput(root, 'Player name').id).toEqual('player');
    });

    test('should fail without a text field of this label', () => {
        expect(() => textFieldInput(root, 'Password')).toThrow('No text field labelled \'Password\'');
    });
});
