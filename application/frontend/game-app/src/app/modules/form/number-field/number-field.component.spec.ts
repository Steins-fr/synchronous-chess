import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, max, min, required } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, test } from 'vitest';
import { NumberFieldComponent } from './number-field.component';

@Component({
    imports: [NumberFieldComponent],
    template: '<app-number-field [field]="bidForm" label="Amount" />',
})
class HostComponent {
    public readonly amount = signal<number | null>(5);
    public readonly bidForm = form(this.amount, (path) => {
        required(path, { message: 'bid.amount.required' });
        min(path, 0, { message: 'bid.amount.min' });
        max(path, 300, { message: 'bid.amount.max' });
    }, { name: 'bid' });
}

describe('NumberFieldComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    function input(): HTMLInputElement {
        return fixture.nativeElement.querySelector('input');
    }

    async function type(value: string): Promise<void> {
        input().value = value;
        input().dispatchEvent(new Event('input'));
        input().dispatchEvent(new Event('blur'));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        // The messages are keys, translated by the field
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setTranslationKey('bid.amount.required', 'The amount is required');
        transloco.setTranslationKey('bid.amount.max', 'At most {max} coins');
        transloco.setTranslationKey('bid.amount.min', 'At least {min} coins');
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should show an outlined number field, with its label and the value of its field', () => {
        // Then
        expect(fixture.nativeElement.querySelector('mat-form-field').className).toContain('mat-form-field-appearance-outline');
        expect(fixture.nativeElement.querySelector('mat-label').textContent).toContain('Amount');
        expect(input().type).toEqual('number');
        expect(input().getAttribute('inputmode')).toEqual('numeric');
        expect(input().value).toEqual('5');
    });

    test('should give the typed number to its field', async () => {
        // When
        await type('42');

        // Then
        expect(fixture.componentInstance.amount()).toEqual(42);
    });

    test('should tell a value the browser could not read', async () => {
        // When letters are typed, the browser giving no value
        Object.defineProperty(input(), 'validity', { configurable: true, value: { ...input().validity, badInput: true } });
        await type('');

        // Then
        expect(fixture.nativeElement.querySelector('mat-error')?.textContent.trim()).toEqual('Enter a number');
        expect(fixture.componentInstance.amount()).toEqual(5);
    });

    test('should translate the message of an error with the values of the error', async () => {
        // When
        await type('301');

        // Then
        expect(fixture.nativeElement.querySelector('mat-error')?.textContent.trim()).toEqual('At most 300 coins');
    });
});
