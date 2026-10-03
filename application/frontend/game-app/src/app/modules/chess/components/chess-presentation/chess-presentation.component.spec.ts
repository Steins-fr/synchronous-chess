import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChessPresentationComponent } from './chess-presentation.component';
import { beforeEach, describe, expect, test } from 'vitest';

describe('ChessPresentationComponent', () => {
    let fixture: ComponentFixture<ChessPresentationComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChessPresentationComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChessPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        // Then
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Échecs synchrones');
        expect(fixture.nativeElement.querySelectorAll('.description li')).toHaveLength(3);
        expect(fixture.nativeElement.querySelector('figcaption')?.textContent).toContain('Les blancs ont choisi leur coup');
    });

    test('should preview the starting board with the move e2 to e4, no piece being playable', () => {
        // Given
        const tiles: Element[] = [...fixture.nativeElement.querySelectorAll('.preview mat-grid-tile')];

        // Then
        expect(tiles).toHaveLength(64);
        expect(tiles.filter((tile: Element) => tile.querySelector('app-chess-piece'))).toHaveLength(32);
        // Rank 4 and rank 2 of the column e
        expect(tiles.flatMap((tile: Element, index: number) => tile.classList.contains('move-preview') ? [index] : [])).toEqual([36, 52]);
        expect(fixture.nativeElement.querySelectorAll('.preview .grab-available')).toHaveLength(0);
    });
});
