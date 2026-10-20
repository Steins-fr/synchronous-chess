import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, maxLength, required } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, test } from 'vitest';
import { TextFieldComponent } from './text-field.component';

@Component({
    imports: [TextFieldComponent],
    template: '<app-text-field [field]="playerForm" label="Name" />',
})
class HostComponent {
    public readonly player = signal<string>('Alice');
    public readonly locked = signal<boolean>(false);
    public readonly playerForm = form(this.player, (path) => {
        required(path, { message: 'player.name.required' });
        maxLength(path, 8, { message: 'player.name.maxLength' });
        disabled(path, { when: () => this.locked() });
    }, { name: 'player' });
}

describe('TextFieldComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    function host(): HostComponent {
        return fixture.componentInstance;
    }

    function input(): HTMLInputElement {
        return fixture.nativeElement.querySelector('input');
    }

    function error(): HTMLElement | null {
        return fixture.nativeElement.querySelector('mat-error');
    }

    async function type(value: string): Promise<void> {
        input().value = value;
        input().dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        // The messages are keys, translated by the field
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setTranslationKey('player.name.required', 'The name is required');
        transloco.setTranslationKey('player.name.maxLength', 'The name is {maxLength, plural, one {# letter} other {# letters}} at most');
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should show an outlined field, with its label, and the value and name of its field', () => {
        // Then
        expect(fixture.nativeElement.querySelector('mat-form-field').className).toContain('mat-form-field-appearance-outline');
        expect(fixture.nativeElement.querySelector('mat-label').textContent).toContain('Name');
        expect(input().value).toEqual('Alice');
        expect(input().name).toEqual(host().playerForm().name());
    });

    test('should mark a required field with the asterisk of Material', () => {
        // Then
        expect(fixture.nativeElement.querySelector('.mat-mdc-form-field-required-marker')).not.toBeNull();
        expect(input().getAttribute('aria-required')).toEqual('true');
    });

    test('should give the typed text to its field, and show the value the form sets', async () => {
        // When
        await type('Bob');

        // Then
        expect(host().player()).toEqual('Bob');

        // When
        host().player.set('Carol');
        await fixture.whenStable();

        // Then
        expect(input().value).toEqual('Carol');
    });

    test('should show the error of an invalid field once touched', async () => {
        // When
        await type('');

        // Then
        expect(error()).toBeNull();

        // When
        input().dispatchEvent(new Event('blur'));
        await fixture.whenStable();

        // Then
        expect(host().playerForm().touched()).toEqual(true);
        expect(error()?.textContent.trim()).toEqual('The name is required');
        expect(fixture.nativeElement.querySelector('mat-form-field').className).toContain('mat-form-field-invalid');
    });

    test('should translate the message of an error with the values of the error', async () => {
        // When
        await type('Bartholomew');
        input().dispatchEvent(new Event('blur'));
        await fixture.whenStable();

        // Then
        expect(error()?.textContent.trim()).toEqual('The name is 8 letters at most');
    });

    test('should be disabled when its field is', async () => {
        // When
        host().locked.set(true);
        await fixture.whenStable();

        // Then
        expect(input().disabled).toEqual(true);
    });
});
