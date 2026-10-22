import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { CardDeckComponent } from './card-deck.component';

describe('CardDeckComponent', () => {
    let fixture: ComponentFixture<CardDeckComponent>;

    const deck = (): HTMLElement => fixture.nativeElement.querySelector('[role="img"]');
    const show = async (count: number, shuffling: boolean = false): Promise<void> => {
        fixture.componentRef.setInput('count', count);
        fixture.componentRef.setInput('shuffling', shuffling);
        await fixture.whenStable();
    };

    beforeEach(() => {
        fixture = TestBed.createComponent(CardDeckComponent);
    });

    test.each<{ count: number; label: string }>([
        { count: 7, label: 'Deck of 7 cards' },
        { count: 1, label: 'Deck of 1 card' },
    ])('should show a deck of $count face down, with its count', async ({ count, label }) => {
        // When
        await show(count);

        // Then
        expect(deck().getAttribute('aria-label')).toEqual(label);
        expect(fixture.nativeElement.querySelectorAll('app-playing-card')).toHaveLength(3);
        expect(fixture.nativeElement.querySelector('span').textContent).toEqual(`${ count }`);
        expect(deck().classList).not.toContain('shuffling');
    });

    test('should show the place of an empty deck', async () => {
        // When
        await show(0);

        // Then
        expect(deck().getAttribute('aria-label')).toEqual('Deck of 0 cards');
        expect(fixture.nativeElement.querySelectorAll('app-playing-card')).toHaveLength(0);
        expect(fixture.nativeElement.querySelector('.border-dashed')).not.toBeNull();
    });

    test('should riffle while shuffled', async () => {
        // When
        await show(17, true);

        // Then
        expect(deck().classList).toContain('shuffling');
    });
});
