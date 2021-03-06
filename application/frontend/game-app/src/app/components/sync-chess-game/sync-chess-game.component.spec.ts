import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SyncChessGameComponent } from './sync-chess-game.component';
import { ChessBoardComponent } from '../chess-board/chess-board.component';
import { PieceComponent } from '../chess-board/piece/piece.component';
import { RangePipe } from '../../pipes/range.pipe';
import { Vector2dPipe } from '../../pipes/vector2d.pipe';
import { MatGridListModule } from '@angular/material/grid-list';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PromotionComponent } from '../chess/promotion/promotion.component';

describe('SyncChessGameComponent', () => {
    let component: SyncChessGameComponent;
    let fixture: ComponentFixture<SyncChessGameComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                SyncChessGameComponent,
                ChessBoardComponent,
                PieceComponent,
                PromotionComponent,
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
