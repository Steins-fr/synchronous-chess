import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { PokerRulesComponent } from './poker-rules.component';

describe('PokerRulesComponent', () => {
    let fixture: ComponentFixture<PokerRulesComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(PokerRulesComponent);
        await fixture.whenStable();
    });

    test('should tell the rules under their title', () => {
        expect(fixture.nativeElement.querySelector('h2')?.textContent).toEqual('Rules');
        expect(Array.from(fixture.nativeElement.querySelectorAll('h3'), (heading: HTMLElement) => heading.textContent))
            .toEqual(['The deck', 'The hands, from the best', 'A hand', 'The match', 'No dealer']);
        expect(fixture.nativeElement.querySelectorAll('li')).toHaveLength(13);
    });

    test('should hide their title when already titled', async () => {
        // When
        fixture.componentRef.setInput('withTitle', false);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    });
});
