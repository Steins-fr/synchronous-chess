import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardRank, CardSuit, JOKER, PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { Language } from '@app/services/language/enums/language.enum';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, test } from 'vitest';
import { PlayingCardComponent } from './playing-card.component';

describe('PlayingCardComponent', () => {
    let fixture: ComponentFixture<PlayingCardComponent>;

    const show = async (card: PlayingCard | null, highlighted: boolean = false): Promise<void> => {
        fixture.componentRef.setInput('card', card);
        fixture.componentRef.setInput('highlighted', highlighted);
        await fixture.whenStable();
    };
    const image = (): HTMLElement => fixture.nativeElement.querySelector('[role="img"]');
    const texts = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('text'), (text: SVGTextElement) => text.textContent);
    const face = (): SVGGElement | null => fixture.nativeElement.querySelector('svg g');

    beforeEach(() => {
        fixture = TestBed.createComponent(PlayingCardComponent);
    });

    test('should show its back while face down', async () => {
        // When
        await show(null);

        // Then
        expect(image().getAttribute('aria-label')).toEqual('Face-down card');
        expect(image().classList).toContain('rotate-y-180');
        expect(face()).toBeNull();
    });

    test('should show an ace with its rank in the corners and a large pip', async () => {
        // When
        await show({ rank: CardRank.ACE, suit: CardSuit.SPADES });

        // Then
        expect(image().getAttribute('aria-label')).toEqual('Ace of spades');
        expect(image().classList).not.toContain('rotate-y-180');
        expect(texts()).toEqual(['A', 'A']);
        expect(face()?.getAttribute('class')).toContain('fill-app-card-ink');
        expect(fixture.nativeElement.querySelector('path[transform="translate(28 48) scale(0.44)"]')).not.toBeNull();
    });

    test('should show a face card framed, in red for the hearts and the diamonds', async () => {
        // When
        await show({ rank: CardRank.QUEEN, suit: CardSuit.HEARTS });

        // Then
        expect(image().getAttribute('aria-label')).toEqual('Queen of hearts');
        expect(texts()).toEqual(['Q', 'Q', 'Q']);
        expect(face()?.getAttribute('class')).toContain('fill-app-card-red');
    });

    test('should show the joker with its star', async () => {
        // When
        await show(JOKER);

        // Then
        expect(image().getAttribute('aria-label')).toEqual('Joker');
        expect(texts()).toEqual([]);
        expect(fixture.nativeElement.querySelector('path.fill-app-card-back')).not.toBeNull();
    });

    test('should turn over to its face once its card is known', async () => {
        // Given
        await show(null);

        // When
        await show({ rank: CardRank.JACK, suit: CardSuit.CLUBS });

        // Then
        expect(image().classList).not.toContain('rotate-y-180');
        expect(image().getAttribute('aria-label')).toEqual('Jack of clubs');
    });

    test('should outline a card of the winning hand', async () => {
        // When
        await show({ rank: CardRank.KING, suit: CardSuit.DIAMONDS }, true);

        // Then
        expect(image().classList).toContain('outline-3');
    });

    test('should name the card and its rank in the language of the user', async () => {
        // Given
        TestBed.inject(TranslocoService).setActiveLang(Language.FR);

        // When
        await show({ rank: CardRank.KING, suit: CardSuit.HEARTS });

        // Then
        expect(image().getAttribute('aria-label')).toEqual('Roi de cœur');
        expect(texts()).toEqual(['R', 'R', 'R']);
    });
});
