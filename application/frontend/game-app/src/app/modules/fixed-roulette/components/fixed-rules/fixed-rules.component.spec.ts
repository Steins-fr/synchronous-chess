import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { FixedRulesComponent } from './fixed-rules.component';

describe('FixedRulesComponent', () => {
    let fixture: ComponentFixture<FixedRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(FixedRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules and every case of the settlement, titled', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (title: Element) => title.textContent))
            .toEqual(['The table', 'A game', 'The settlement', 'The end of the match', 'Out of time', 'The times', 'Fair play']);
        expect(fixture.nativeElement.querySelectorAll('table tbody tr')).toHaveLength(4);
        // The example of the manga, and the chip left over
        expect(fixture.nativeElement.textContent).toContain('The croupier receives 24 chips and loses 50, −26');
        expect(fixture.nativeElement.textContent).toContain('the chip left over to the punter');
    });

    test('should hide its title within a titled section', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
