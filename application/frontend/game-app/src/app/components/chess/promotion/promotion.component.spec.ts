import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PromotionComponent } from './promotion.component';
import { PieceComponent } from '../../chess-board/piece/piece.component';
import { MatGridListModule } from '@angular/material/grid-list';

describe('PromotionComponent', () => {
    let component: PromotionComponent;
    let fixture: ComponentFixture<PromotionComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [PromotionComponent, PieceComponent],
            imports: [
                MatGridListModule
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(PromotionComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
