import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { RouletteRulesComponent } from './roulette-rules.component';

describe('RouletteRulesComponent', () => {
    let fixture: ComponentFixture<RouletteRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(RouletteRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules, titled', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (title: Element) => title.textContent))
            .toEqual(['The cylinder', 'Each turn', 'End of the game', 'Fair play']);
        expect(fixture.nativeElement.textContent).toContain('A player whom a death leaves with 0 chips or fewer goes bankrupt');
    });

    test('should hide its title within a titled section', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
