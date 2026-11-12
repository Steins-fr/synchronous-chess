import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, submit, validate } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, test } from 'vitest';
import { FormErrorComponent } from './form-error.component';

@Component({
    imports: [FormErrorComponent],
    template: '<app-form-error [field]="betsForm" />',
})
class HostComponent {
    public readonly bets = signal<{ one: number; two: number }>({ one: 0, two: 0 });
    public readonly betsForm = form(this.bets, (path) => {
        validate(path, ({ value }) => value().one + value().two > 0 ? undefined : { kind: 'none', message: 'bets.none' });
        validate(path, ({ value }) => value().one + value().two <= 10 ? undefined : { kind: 'over', message: 'bets.over', max: 10 });
    }, { name: 'bets' });
}

describe('FormErrorComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    const text = (): string => (fixture.nativeElement.querySelector('app-form-error p') as HTMLElement).textContent.trim();

    beforeEach(async () => {
        // The messages are keys, translated by the component
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setTranslationKey('bets.none', 'Bet 1 chip at least');
        transloco.setTranslationKey('bets.over', 'At most {max} chips');
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should keep its line empty while the group is not touched', () => {
        // Then
        expect(text()).toEqual('');
        expect(fixture.nativeElement.querySelector('app-form-error p').getAttribute('aria-live')).toEqual('polite');
    });

    test('should tell the first error of the group once the form is submitted, with the values of the error', async () => {
        // When
        await submit(fixture.componentInstance.betsForm, { action: () => Promise.resolve() });
        await fixture.whenStable();

        // Then
        expect(text()).toEqual('Bet 1 chip at least');

        // When
        fixture.componentInstance.bets.set({ one: 8, two: 5 });
        await fixture.whenStable();

        // Then
        expect(text()).toEqual('At most 10 chips');

        // When
        fixture.componentInstance.bets.set({ one: 8, two: 0 });
        await fixture.whenStable();

        // Then
        expect(text()).toEqual('');
    });
});
