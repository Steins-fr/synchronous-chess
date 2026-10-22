import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { PokerPresentationComponent } from './poker-presentation.component';

describe('PokerPresentationComponent', () => {
    let fixture: ComponentFixture<PokerPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(PokerPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Seventeen poker');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
    });

    test('should show the best hand of the game', () => {
        const labels: string[] = Array.from(fixture.nativeElement.querySelectorAll('figure [role="img"]'), (image: HTMLElement) => image.getAttribute('aria-label') as string);
        expect(labels).toEqual(['Ace of spades', 'Ace of hearts', 'Ace of diamonds', 'Ace of clubs', 'Joker']);
        expect(fixture.nativeElement.querySelector('figcaption')?.textContent).toEqual('Four aces and the joker: the best hand of the game.');
    });
});
