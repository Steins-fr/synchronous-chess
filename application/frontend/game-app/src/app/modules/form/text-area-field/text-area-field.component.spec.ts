import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, maxLength } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, test } from 'vitest';
import { TextAreaFieldComponent } from './text-area-field.component';

@Component({
    imports: [TextAreaFieldComponent],
    template: '<app-text-area-field [field]="noteForm" [maxRows]="3" label="Note" />',
})
class HostComponent {
    public readonly note = signal<string>('Hello');
    public readonly noteForm = form(this.note, (path) => {
        maxLength(path, 8, { message: 'note.maxLength' });
    }, { name: 'note' });
}

describe('TextAreaFieldComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    function textArea(): HTMLTextAreaElement {
        return fixture.nativeElement.querySelector('textarea');
    }

    async function type(value: string): Promise<void> {
        textArea().value = value;
        textArea().dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        TestBed.inject(TranslocoService).setTranslationKey('note.maxLength', 'The note is {maxLength, plural, one {# letter} other {# letters}} at most');
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should show an outlined text area, with its label, and the value and name of its field', () => {
        // Then
        expect(fixture.nativeElement.querySelector('mat-form-field').className).toContain('mat-form-field-appearance-outline');
        expect(fixture.nativeElement.querySelector('mat-label').textContent).toContain('Note');
        expect(textArea().value).toEqual('Hello');
        expect(textArea().name).toEqual(fixture.componentInstance.noteForm().name());
        expect(textArea().getAttribute('rows')).toEqual('1');
    });

    test('should give the typed text to its field', async () => {
        // When
        await type('Hello\nworld');

        // Then
        expect(fixture.componentInstance.note()).toEqual('Hello\nworld');
    });

    test('should show the message of its first error, once touched', async () => {
        // When
        await type('A too long note');
        textArea().dispatchEvent(new Event('blur'));
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('mat-error').textContent).toContain('The note is 8 letters at most');
    });
});
