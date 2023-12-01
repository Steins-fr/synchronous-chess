import { DragDropModule } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatGridListModule } from '@angular/material/grid-list';
import { ChessBoardComponent } from '@app/components/chess-board/chess-board.component';
import { ChessBoardPieceComponent } from '@app/components/chess-board/piece/chess-board-piece.component';
import { PromotionComponent } from '@app/components/chess/promotion/promotion.component';
import { SyncChessGameComponent } from '@app/components/sync-chess-game/sync-chess-game.component';
import { Vector2dPipe } from '@app/pipes/vector2d.pipe';

describe('SyncChessGameComponent', () => {
    let component: SyncChessGameComponent;
    let fixture: ComponentFixture<SyncChessGameComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [
                SyncChessGameComponent,
                ChessBoardComponent,
                ChessBoardPieceComponent,
                PromotionComponent,
                Vector2dPipe
            ],
            imports: [
                MatGridListModule,
                DragDropModule
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(SyncChessGameComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
