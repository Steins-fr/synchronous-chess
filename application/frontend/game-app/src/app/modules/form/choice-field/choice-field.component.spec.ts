import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, validate } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';
import { choiceFieldOption } from '@testing/text-field.helper';
import { beforeEach, describe, expect, test } from 'vitest';
import { ChoiceFieldComponent, ChoiceOption } from './choice-field.component';

enum Time {
    SHORT = 'short',
    LONG = 'long',
}

const OPTIONS: ReadonlyArray<ChoiceOption> = [
    { value: Time.SHORT, label: { key: 'time.seconds', params: { count: 30 } } },
    { value: Time.LONG, label: { key: 'time.minutes', params: { count: 1 } } },
];

@Component({
    imports: [ChoiceFieldComponent],
    template: '<app-choice-field [field]="timeForm" [options]="options" label="Time to vote" />',
})
class HostComponent {
    public readonly options: ReadonlyArray<ChoiceOption> = OPTIONS;
    public readonly locked = signal<boolean>(false);
    public readonly time = signal<Time>(Time.LONG);
    public readonly timeForm = form(this.time, (path) => {
        disabled(path, { when: () => this.locked() });
        validate(path, ({ value }) => (value() === Time.SHORT ? { kind: 'short', message: 'time.short' } : undefined));
    }, { name: 'time' });
}

describe('ChoiceFieldComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    const option = (label: string): HTMLButtonElement => choiceFieldOption(fixture.nativeElement, 'Time to vote', label);

    beforeEach(async () => {
        // The labels are keys, translated by the field
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setTranslationKey('time.seconds', '{count} s');
        transloco.setTranslationKey('time.minutes', '{count} min');
        transloco.setTranslationKey('time.short', 'Too short');
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should show its options as radio buttons of a group named by its label, the value of its field checked', () => {
        // Then
        const group: HTMLElement = fixture.nativeElement.querySelector('mat-button-toggle-group');
        expect(group.getAttribute('role')).toEqual('radiogroup');
        expect(fixture.nativeElement.querySelector(`#${ group.getAttribute('aria-labelledby') }`).textContent).toEqual('Time to vote');
        expect([option('30 s').getAttribute('role'), option('30 s').getAttribute('aria-checked'), option('1 min').getAttribute('aria-checked')])
            .toEqual(['radio', 'false', 'true']);
        expect([group.getAttribute('aria-invalid'), group.getAttribute('aria-describedby')]).toEqual([null, null]);
    });

    test('should give the option clicked to its field', async () => {
        // When
        option('30 s').click();
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.time()).toEqual(Time.SHORT);
        expect(option('30 s').getAttribute('aria-checked')).toEqual('true');
    });

    test('should show the first error of its field once touched', async () => {
        // Given a value refused, untouched
        fixture.componentInstance.time.set(Time.SHORT);
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('mat-error')).toBeNull();

        // When
        fixture.componentInstance.timeForm().markAsTouched();
        await fixture.whenStable();

        // Then the group is invalid, described by its error, which a screen reader tells
        const error: HTMLElement = fixture.nativeElement.querySelector('mat-error');
        const group: HTMLElement = fixture.nativeElement.querySelector('mat-button-toggle-group');
        expect(error.textContent).toEqual('Too short');
        expect([group.getAttribute('aria-invalid'), group.getAttribute('aria-describedby')]).toEqual(['true', error.id]);
        expect(error.parentElement?.getAttribute('aria-live')).toEqual('polite');
    });

    test('should disable its options with its field', async () => {
        // When
        fixture.componentInstance.locked.set(true);
        await fixture.whenStable();

        // Then
        expect([option('30 s').disabled, option('1 min').disabled]).toEqual([true, true]);
    });
});
