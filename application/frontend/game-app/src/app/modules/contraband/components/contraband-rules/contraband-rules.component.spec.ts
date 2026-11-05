import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { ContrabandRulesComponent } from './contraband-rules.component';

describe('ContrabandRulesComponent', () => {
    let fixture: ComponentFixture<ContrabandRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(ContrabandRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules of both variants, titled', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (title: Element) => title.textContent)).toEqual([
            'The table', 'The money', 'The pairs', 'A game', 'The Classic variant', 'The Gold Rush variant', 'The end of the match', 'The conversations',
            'The times', 'Fair play',
        ]);
        expect(fixture.nativeElement.textContent).toContain('An iron bar checked: the inspector pays 100 million to the smuggler.');
    });

    test('should hide its title within a titled section', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
