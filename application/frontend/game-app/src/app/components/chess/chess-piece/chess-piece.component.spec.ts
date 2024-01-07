import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessPieceComponent } from './chess-piece.component';
import { FenPiece } from '@app/classes/chess/rules/chess-rules';

describe('ChessPieceComponent', () => {
    let component: ChessPieceComponent;
    let fixture: ComponentFixture<ChessPieceComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ChessPieceComponent]
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(ChessPieceComponent);
        component = fixture.componentInstance;
        component.piece = FenPiece.BLACK_PAWN;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
