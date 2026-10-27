import { describe, expect, test } from 'vitest';
import { textAreaFieldInput, textFieldInput } from './text-field.helper';

describe('textFieldInput', () => {
    const root: HTMLElement = document.createElement('div');
    root.innerHTML = `
        <app-text-field><mat-label>Room name</mat-label><input id="room"></app-text-field>
        <app-text-field><mat-label> Player name </mat-label><input id="player"></app-text-field>
        <app-text-area-field><mat-label>Message</mat-label><textarea id="message"></textarea></app-text-area-field>`;

    test('should find the input of the text field by its label', () => {
        expect(textFieldInput(root, 'Player name').id).toEqual('player');
    });

    test('should find the text area of the text area field by its label', () => {
        expect(textAreaFieldInput(root, 'Message').id).toEqual('message');
    });

    test('should fail without a text field of this label', () => {
        expect(() => textFieldInput(root, 'Password')).toThrow('No text field labelled \'Password\'');
        expect(() => textAreaFieldInput(root, 'Player name')).toThrow('No text field labelled \'Player name\'');
    });
});
