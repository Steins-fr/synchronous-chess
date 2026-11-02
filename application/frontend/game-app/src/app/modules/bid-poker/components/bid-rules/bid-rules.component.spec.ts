import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { BidRulesComponent } from './bid-rules.component';

describe('BidRulesComponent', () => {
    let fixture: ComponentFixture<BidRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(BidRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules, titled', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (title: Element) => title.textContent))
            .toEqual(['The table', 'The dealing session', 'The change sessions', 'The end', 'The times', 'Fair play']);
        expect(fixture.nativeElement.textContent).toContain('There is always one pig at least, and each pig pays 150 coins');
    });

    test('should hide its title within a titled section', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
