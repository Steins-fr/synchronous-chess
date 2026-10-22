import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { ChipStackComponent } from './chip-stack.component';

describe('ChipStackComponent', () => {
    let fixture: ComponentFixture<ChipStackComponent>;

    const chips = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.chip'));

    beforeEach(async () => {
        fixture = TestBed.createComponent(ChipStackComponent);
        fixture.componentRef.setInput('amount', 139);
        await fixture.whenStable();
    });

    test('should pile the fewest chips making the amount, a pile for each value, hidden from screen readers', () => {
        expect(chips().map((chip: HTMLElement) => chip.dataset['value'])).toEqual(['100', '25', '5', '5', '1', '1', '1', '1']);
        expect(chips().map((chip: HTMLElement) => chip.style.gridColumn)).toEqual(['1', '2', '3', '3', '4', '4', '4', '4']);
        expect(chips().map((chip: HTMLElement) => chip.style.getPropertyValue('--chip-level'))).toEqual(['0', '0', '0', '1', '0', '1', '2', '3']);
        expect(chips()[1].classList).toContain('bg-app-chip-25');
        expect(fixture.nativeElement.getAttribute('aria-hidden')).toEqual('true');
        expect(fixture.nativeElement.classList).not.toContain('flying');
    });

    test('should not drop the chips moving from a stack to another one', async () => {
        // When
        fixture.componentRef.setInput('placed', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.classList).toContain('flying');
    });

    test('should keep the chips of a pile keeping them', async () => {
        // Given
        const hundred: HTMLElement = chips()[0];

        // When
        fixture.componentRef.setInput('amount', 105);
        await fixture.whenStable();

        // Then
        expect(chips().map((chip: HTMLElement) => chip.dataset['value'])).toEqual(['100', '5']);
        expect(chips()[0]).toBe(hundred);
    });
});
