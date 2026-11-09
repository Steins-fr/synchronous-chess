import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { EdenRulesComponent } from './eden-rules.component';

describe('EdenRulesComponent', () => {
    let fixture: ComponentFixture<EdenRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(EdenRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules and every line of the table of gains, titled', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (title: Element) => title.textContent))
            .toEqual(['The table', 'A round', 'The gains', 'Missed apples', 'The loss of paradise', 'The times', 'Fair play']);
        expect(fixture.nativeElement.querySelectorAll('table tbody tr')).toHaveLength(7);
        expect(fixture.nativeElement.textContent).toContain('−1,000 million, its player named');
    });

    test('should hide its title within a titled section', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
