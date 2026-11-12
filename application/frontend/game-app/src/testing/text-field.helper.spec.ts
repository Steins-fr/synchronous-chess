import { describe, expect, test } from 'vitest';
import { choiceAreaOption, choiceFieldOption, stakeFieldInput, textAreaFieldInput, textFieldInput } from './text-field.helper';

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

describe('choiceFieldOption', () => {
    const root: HTMLElement = document.createElement('div');
    root.innerHTML = `
        <app-choice-field><legend>Variant</legend><button id="elimination"> Elimination </button><button id="score">Score</button></app-choice-field>
        <app-choice-field><legend>Time</legend><button id="short">30 s</button></app-choice-field>`;

    test('should find the button of an option by the label of its field and its text', () => {
        expect(choiceFieldOption(root, 'Variant', 'Elimination').id).toEqual('elimination');
        expect(choiceFieldOption(root, 'Time', '30 s').id).toEqual('short');
    });

    test('should fail without a choice field of this label, or without this option', () => {
        expect(() => choiceFieldOption(root, 'Speed', 'Score')).toThrow('No option \'Score\' of a choice field labelled \'Speed\'');
        expect(() => choiceFieldOption(root, 'Time', 'Score')).toThrow('No option \'Score\' of a choice field labelled \'Time\'');
    });
});

describe('stakeFieldInput', () => {
    const root: HTMLElement = document.createElement('div');
    root.innerHTML = `
        <app-stake-field><input id="one" aria-label="Chips on 1"></app-stake-field>
        <app-stake-field><input id="two" aria-label="Chips on 2"></app-stake-field>`;

    test('should find the input of the stake field by its label', () => {
        expect(stakeFieldInput(root, 'Chips on 2').id).toEqual('two');
    });

    test('should fail without a stake field of this label', () => {
        expect(() => stakeFieldInput(root, 'Chips on 3')).toThrow('No stake field labelled \'Chips on 3\'');
    });
});

describe('choiceAreaOption', () => {
    const root: HTMLElement = document.createElement('div');
    root.innerHTML = `
        <div role="radiogroup" aria-label="Pocket of the ball">
            <app-choice-area><label><input id="first" type="radio"> 1 </label></app-choice-area>
            <app-choice-area><label><input id="second" type="radio">2</label></app-choice-area>
        </div>`;

    test('should find the radio button of an option by the label of its group and its text', () => {
        expect(choiceAreaOption(root, 'Pocket of the ball', '1').id).toEqual('first');
        expect(choiceAreaOption(root, 'Pocket of the ball', '2').id).toEqual('second');
    });

    test('should fail without a group of this label, or without this option', () => {
        expect(() => choiceAreaOption(root, 'Pocket', '1')).toThrow('No option \'1\' of the choice areas labelled \'Pocket\'');
        expect(() => choiceAreaOption(root, 'Pocket of the ball', '3')).toThrow('No option \'3\' of the choice areas labelled \'Pocket of the ball\'');
    });
});
