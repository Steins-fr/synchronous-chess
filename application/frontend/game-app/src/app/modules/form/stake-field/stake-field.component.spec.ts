import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, max } from '@angular/forms/signals';
import { beforeEach, describe, expect, test } from 'vitest';
import { StakeFieldComponent } from './stake-field.component';

@Component({
    imports: [StakeFieldComponent],
    template: '<app-stake-field [field]="stakeForm" label="Chips on 2" [formId]="formId()" />',
})
class HostComponent {
    public readonly stake = signal<number | null>(null);
    public readonly formId = signal<string | null>('bets');
    public readonly stakeForm = form(this.stake, (path) => {
        max(path, 20, { message: 'stake.max' });
    }, { name: 'stake' });
}

describe('StakeFieldComponent', () => {
    let fixture: ComponentFixture<HostComponent>;

    const host = (): HTMLElement => fixture.nativeElement.querySelector('app-stake-field');
    const input = (): HTMLInputElement => host().querySelector('input') as HTMLInputElement;
    const buttons = (): HTMLButtonElement[] => Array.from(host().querySelectorAll('button'));

    async function type(value: string): Promise<void> {
        input().value = value;
        input().dispatchEvent(new Event('input'));
        input().dispatchEvent(new Event('blur'));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
    });

    test('should show a compact number input, named by its label, in the form given', async () => {
        // Then
        expect(input().type).toEqual('number');
        expect(input().getAttribute('inputmode')).toEqual('numeric');
        expect(input().getAttribute('aria-label')).toEqual('Chips on 2');
        expect(input().getAttribute('form')).toEqual('bets');
        expect(input().value).toEqual('');
        expect(host().classList).not.toContain('stake-invalid');
        // The buttons are for a pointer only
        expect(buttons().map((button: HTMLButtonElement) => [button.textContent.trim(), button.getAttribute('aria-hidden'), button.tabIndex, button.type]))
            .toEqual([['−', 'true', -1, 'button'], ['+', 'true', -1, 'button']]);

        // When the input lies in its form
        fixture.componentInstance.formId.set(null);
        await fixture.whenStable();

        // Then
        expect(input().hasAttribute('form')).toBe(false);
    });

    test('should give the typed stake to its field, and mark a stake refused once touched', async () => {
        // When
        await type('12');

        // Then
        expect(fixture.componentInstance.stake()).toEqual(12);
        expect(host().classList).not.toContain('stake-invalid');

        // When
        await type('21');

        // Then
        expect(host().classList).toContain('stake-invalid');
    });

    test('should step the stake by its buttons, from an empty field and never below 0', async () => {
        // Given
        const [less, more] = buttons();

        // When
        more.click();
        more.click();
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.stake()).toEqual(10);
        expect(input().value).toEqual('10');

        // When
        less.click();
        less.click();
        less.click();
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.stake()).toEqual(0);
    });
});
