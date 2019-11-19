import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SyncChessGameComponent } from './sync-chess-game.component';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { PieceComponent } from '../chess-board/piece/piece.component';
import { RangePipe } from 'src/app/pipes/range.pipe';
import { Vector2dPipe } from 'src/app/pipes/vector2d.pipe';
import { MatGridListModule } from '@angular/material/grid-list';
import { DragDropModule } from '@angular/cdk/drag-drop';

describe('SyncChessGameComponent', () => {
    let component: SyncChessGameComponent;
    let fixture: ComponentFixture<SyncChessGameComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                SyncChessGameComponent,
                ChessBoardComponent,
                PieceComponent,
                RangePipe,
                Vector2dPipe
            ],
            imports: [
                MatGridListModule,
                DragDropModule
            ]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(SyncChessGameComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
