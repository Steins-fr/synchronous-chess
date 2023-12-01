import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessBoardPieceComponent } from './chess-board-piece.component';
import { FenPiece } from '@app/classes/chess/rules/chess-rules';

describe('PieceComponent', () => {
    let component: ChessBoardPieceComponent;
    let fixture: ComponentFixture<ChessBoardPieceComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ChessBoardPieceComponent]
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(ChessBoardPieceComponent);
        component = fixture.componentInstance;
        component.piece = FenPiece.BLACK_PAWN;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
