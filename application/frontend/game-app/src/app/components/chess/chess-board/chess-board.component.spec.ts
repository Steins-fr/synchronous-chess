import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessBoardComponent } from './chess-board.component';
import { MatGridListModule } from '@angular/material/grid-list';
import { RangePipe } from '@app/pipes/range.pipe';
import { ChessBoardPieceComponent } from './piece/chess-board-piece.component';
import { Vector2dPipe } from '@app/pipes/vector2d.pipe';
import { DragDropModule } from '@angular/cdk/drag-drop';

describe('ChessBoardComponent', () => {
    let component: ChessBoardComponent;
    let fixture: ComponentFixture<ChessBoardComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [
                ChessBoardComponent,
                ChessBoardPieceComponent,
                RangePipe,
                Vector2dPipe],
            imports: [
                MatGridListModule,
                DragDropModule
            ]
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(ChessBoardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
