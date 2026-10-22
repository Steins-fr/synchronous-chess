import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardRank, CardSuit, JOKER } from '@app/modules/playing-cards/types/playing-card';
import { beforeEach, describe, expect, test } from 'vitest';
import { CardHandComponent, HandCard } from './card-hand.component';

describe('CardHandComponent', () => {
    let fixture: ComponentFixture<CardHandComponent>;

    const hand: ReadonlyArray<HandCard> = [
        { id: 'deck:3', card: { rank: CardRank.ACE, suit: CardSuit.SPADES } },
        { id: 'deck:7', card: null },
        { id: 'deck:16', card: JOKER },
    ];

    const items = (): HTMLLIElement[] => Array.from(fixture.nativeElement.querySelectorAll('li'));
    const labels = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('[role="img"]'), (image: HTMLElement) => image.getAttribute('aria-label') as string);
    const buttons = (): HTMLButtonElement[] => Array.from(fixture.nativeElement.querySelectorAll('button'));

    beforeEach(async () => {
        fixture = TestBed.createComponent(CardHandComponent);
        fixture.componentRef.setInput('cards', hand);
        await fixture.whenStable();
    });

    test('should show the cards in a fan around its middle', () => {
        // Then
        expect(labels()).toEqual(['Ace of spades', 'Face-down card', 'Joker']);
        expect(items().map((item: HTMLLIElement) => item.style.getPropertyValue('--fan-offset'))).toEqual(['-1', '0', '1']);
        expect(items().map((item: HTMLLIElement) => item.style.getPropertyValue('--deal-index'))).toEqual(['0', '1', '2']);
        expect(buttons()).toHaveLength(0);
    });

    test('should outline the cards of the winning hand', async () => {
        // When
        fixture.componentRef.setInput('highlighted', ['deck:3', 'deck:16']);
        await fixture.whenStable();

        // Then
        const outlined: boolean[] = Array.from(fixture.nativeElement.querySelectorAll('[role="img"]'), (image: HTMLElement) => image.classList.contains('outline-3'));
        expect(outlined).toEqual([true, false, true]);
    });

    test('should toggle the selection of a card with its button', async () => {
        // Given
        fixture.componentRef.setInput('selectable', true);
        await fixture.whenStable();

        // When
        buttons()[2].click();
        buttons()[0].click();
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.selected()).toEqual(['deck:16', 'deck:3']);
        expect(buttons().map((button: HTMLButtonElement) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
        expect(items().map((item: HTMLLIElement) => item.classList.contains('selected'))).toEqual([true, false, true]);

        // When
        buttons()[2].click();
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.selected()).toEqual(['deck:3']);
        expect(buttons()[2].getAttribute('aria-pressed')).toEqual('false');
    });

    test('should keep the cards staying in the hand when others leave it, dealing the ones entering it first', async () => {
        // Given
        const ace: HTMLLIElement = items()[0];

        // When
        fixture.componentRef.setInput('cards', [
            hand[0],
            { id: 'deck:11', card: { rank: CardRank.KING, suit: CardSuit.CLUBS } },
            { id: 'deck:12', card: null },
        ]);
        await fixture.whenStable();

        // Then
        expect(items()[0]).toBe(ace);
        expect(labels()).toEqual(['Ace of spades', 'King of clubs', 'Face-down card']);
        expect(items().map((item: HTMLLIElement) => item.style.getPropertyValue('--deal-index'))).toEqual(['', '0', '1']);
    });

    test('should lift the cards selected only while the hand is selectable', async () => {
        // When
        fixture.componentInstance.selected.set(['deck:7']);
        await fixture.whenStable();

        // Then
        expect(items().map((item: HTMLLIElement) => item.classList.contains('selected'))).toEqual([false, false, false]);
    });
});
