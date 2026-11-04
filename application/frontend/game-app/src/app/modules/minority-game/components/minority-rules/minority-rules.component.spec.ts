import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { MinorityRulesComponent } from './minority-rules.component';

describe('MinorityRulesComponent', () => {
    let fixture: ComponentFixture<MinorityRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(MinorityRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules of both variants, titled', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (title: Element) => title.textContent))
            .toEqual(['The table', 'A question', 'The vote', 'The elimination variant', 'The score variant', 'The times', 'Fair play']);
        expect(fixture.nativeElement.textContent).toContain('with 7 yes and 3 no, each player who voted no scores 7');
    });

    test('should hide its title within a titled section', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
