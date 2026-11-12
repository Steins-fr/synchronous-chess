import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { beforeEach, describe, expect, test } from 'vitest';
import { ChoiceAreaComponent } from './choice-area.component';

@Component({
    imports: [ChoiceAreaComponent],
    template: '<app-choice-area [field]="pocketForm" value="1" formId="place">One</app-choice-area><app-choice-area [field]="pocketForm" value="2">Two</app-choice-area>',
})
class HostComponent {
    public readonly pocket = signal<string>('');
    public readonly pocketForm = form(this.pocket, { name: 'pocket' });
}

describe('ChoiceAreaComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    const radios = (): HTMLInputElement[] => Array.from(fixture.nativeElement.querySelectorAll('input[type="radio"]'));

    beforeEach(async () => {
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should show a radio button in a label holding its content, in the form given', () => {
        // Then
        expect(radios().map((radio: HTMLInputElement) => [radio.value, radio.checked, radio.getAttribute('form')])).toEqual([['1', false, 'place'], ['2', false, null]]);
        expect(radios().map((radio: HTMLInputElement) => radio.closest('label')?.textContent.trim())).toEqual(['One', 'Two']);
    });

    test('should give its value to the field once picked, and follow the field', async () => {
        // When
        radios()[1].click();
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.pocket()).toEqual('2');
        expect(radios().map((radio: HTMLInputElement) => radio.checked)).toEqual([false, true]);

        // When
        fixture.componentInstance.pocket.set('1');
        await fixture.whenStable();

        // Then
        expect(radios().map((radio: HTMLInputElement) => radio.checked)).toEqual([true, false]);
    });
});
