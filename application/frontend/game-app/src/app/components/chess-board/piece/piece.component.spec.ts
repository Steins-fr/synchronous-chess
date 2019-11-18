import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PieceComponent } from './piece.component';
import { FenPiece } from 'src/app/classes/chess/rules/chess-rules';

describe('PieceComponent', () => {
    let component: PieceComponent;
    let fixture: ComponentFixture<PieceComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [PieceComponent]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(PieceComponent);
        component = fixture.componentInstance;
        component.piece = FenPiece.BLACK_PAWN;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
