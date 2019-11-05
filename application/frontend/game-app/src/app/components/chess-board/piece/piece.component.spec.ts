import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PieceComponent } from './piece.component';
import Pawn from 'src/app/classes/chess/piece/pieces/pawn';
import { PieceColor } from 'src/app/classes/chess/piece/piece';

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
        component.piece = new Pawn(PieceColor.BLACK);
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
