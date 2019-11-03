import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessBoardComponent } from './chess-board.component';
import { MatGridListModule } from '@angular/material/grid-list';
import { RangePipe } from 'src/app/pipes/range.pipe';

describe('ChessBoardComponent', () => {
    let component: ChessBoardComponent;
    let fixture: ComponentFixture<ChessBoardComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [ChessBoardComponent, RangePipe],
            imports: [MatGridListModule]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(ChessBoardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
