import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { ChessPieceComponent } from '@app/components/chess/chess-piece/chess-piece.component';

import { ChessPromotionComponent } from './chess-promotion.component';
import { MatGridListModule } from '@angular/material/grid-list';

describe('ChessPromotionComponent', () => {
    let component: ChessPromotionComponent;
    let fixture: ComponentFixture<ChessPromotionComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [ChessPromotionComponent, ChessPieceComponent],
            imports: [
                MatGridListModule
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(ChessPromotionComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
