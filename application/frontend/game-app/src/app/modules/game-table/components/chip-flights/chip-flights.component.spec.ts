import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { middle } from '../../helpers/table-point.helper';
import { ChipFlightsComponent } from './chip-flights.component';

describe('ChipFlightsComponent', () => {
    let fixture: ComponentFixture<ChipFlightsComponent>;

    const flights = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.chip-flight'));
    const amounts = (): string[][] => flights().map((flight: HTMLElement) => Array.from(flight.querySelectorAll<HTMLElement>('.chip')).map((chip: HTMLElement) => chip.dataset['value'] as string));

    beforeEach(async () => {
        fixture = TestBed.createComponent(ChipFlightsComponent);
        await fixture.whenStable();
    });

    test('should fly the chips from a place of the table to another one, once their delay is over', async () => {
        // When
        fixture.componentInstance.launch([
            { amount: 6, from: { x: 10, y: 20 }, to: { x: 110, y: 5 } },
            { amount: 25, from: { x: 0, y: 0 }, to: { x: 0, y: 40 }, delay: 500 },
        ]);
        await fixture.whenStable();

        // Then
        expect(amounts()).toEqual([['5', '1'], ['25']]);
        const [first, second] = flights();
        expect([first.style.left, first.style.top]).toEqual(['10px', '20px']);
        expect(['--flight-x', '--flight-y', '--flight-delay'].map((name: string) => first.style.getPropertyValue(name))).toEqual(['100px', '-15px', '0ms']);
        expect(second.style.getPropertyValue('--flight-delay')).toEqual('500ms');
    });

    test('should keep the chips flying as others take off, until they land', async () => {
        // Given
        fixture.componentInstance.launch([{ amount: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }]);
        await fixture.whenStable();

        // When
        fixture.componentInstance.launch([]);
        fixture.componentInstance.launch([{ amount: 5, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }]);
        await fixture.whenStable();

        // Then
        expect(amounts()).toEqual([['1'], ['5']]);

        // When: the animation of a chip inside the flight ends, then the flight of the first chips is cancelled
        flights()[1].querySelector('.chip')?.dispatchEvent(new Event('animationend', { bubbles: true }));
        flights()[0].dispatchEvent(new Event('animationcancel'));
        await fixture.whenStable();

        // Then
        expect(amounts()).toEqual([['5']]);

        // When
        flights()[0].dispatchEvent(new Event('animationend'));
        await fixture.whenStable();

        // Then
        expect(flights()).toEqual([]);
    });

    test('should find the middle of a box of the table, from its top left corner', () => {
        expect(middle(new DOMRect(30, 50, 20, 10), new DOMRect(10, 20, 400, 300))).toEqual({ x: 30, y: 35 });
    });
});
