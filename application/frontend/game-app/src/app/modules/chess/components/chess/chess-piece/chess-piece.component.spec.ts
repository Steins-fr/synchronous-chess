import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChessPieceComponent } from './chess-piece.component';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { beforeEach, describe, expect, test } from 'vitest';

describe('ChessPieceComponent', () => {
    let fixture: ComponentFixture<ChessPieceComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChessPieceComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChessPieceComponent);
    });

    test.each([
        [FenPiece.WHITE_KING, '♔'],
        [FenPiece.BLACK_QUEEN, '♛'],
        [FenPiece.EMPTY, ''],
    ])('should render %s as %s', async (piece: FenPiece, expected: string) => {
        // When
        fixture.componentRef.setInput('piece', piece);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.chess-piece').textContent).toEqual(expected);
    });
});
