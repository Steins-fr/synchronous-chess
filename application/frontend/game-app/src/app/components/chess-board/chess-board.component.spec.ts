import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessBoardComponent } from './chess-board.component';
import { MatGridListModule } from '@angular/material/grid-list';
import { RangePipe } from 'src/app/pipes/range.pipe';
import { PieceComponent } from './piece/piece.component';
import { Vector2dPipe } from 'src/app/pipes/vector2d.pipe';
import { DragDropModule } from '@angular/cdk/drag-drop';

describe('ChessBoardComponent', () => {
    let component: ChessBoardComponent;
    let fixture: ComponentFixture<ChessBoardComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                ChessBoardComponent,
                PieceComponent,
                RangePipe,
                Vector2dPipe],
            imports: [
                MatGridListModule,
                DragDropModule
            ]
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
