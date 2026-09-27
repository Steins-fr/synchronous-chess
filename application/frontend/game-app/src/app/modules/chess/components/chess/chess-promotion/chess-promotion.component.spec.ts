import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChessPromotionComponent } from './chess-promotion.component';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { PieceType } from '@app/modules/chess/enums/piece-type.enum';
import { beforeEach, describe, expect, test } from 'vitest';

describe('ChessPromotionComponent', () => {
    let fixture: ComponentFixture<ChessPromotionComponent>;

    function renderedPieces(): string[] {
        return Array.from(fixture.nativeElement.querySelectorAll('app-chess-piece'))
            .map((element) => (element as HTMLElement).textContent ?? '');
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChessPromotionComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChessPromotionComponent);
    });

    test('should display the white promotion pieces', async () => {
        // When
        fixture.componentRef.setInput('color', PieceColor.WHITE);
        await fixture.whenStable();

        // Then
        expect(renderedPieces()).toEqual(['♖', '♘', '♗', '♕']);
    });

    test('should display the black promotion pieces', async () => {
        // When
        fixture.componentRef.setInput('color', PieceColor.BLACK);
        await fixture.whenStable();

        // Then
        expect(renderedPieces()).toEqual(['♜', '♞', '♝', '♛']);
    });

    test('should emit the chosen piece type', async () => {
        // Given
        const chosen: PieceType[] = [];
        fixture.componentInstance.pieceType.subscribe((pieceType: PieceType) => chosen.push(pieceType));
        fixture.componentRef.setInput('color', PieceColor.WHITE);
        await fixture.whenStable();

        // When
        (fixture.nativeElement.querySelectorAll('app-chess-piece') as NodeListOf<HTMLElement>).forEach((element: HTMLElement) => element.click());

        // Then
        expect(chosen).toEqual([PieceType.ROOK, PieceType.KNIGHT, PieceType.BISHOP, PieceType.QUEEN]);
    });
});
