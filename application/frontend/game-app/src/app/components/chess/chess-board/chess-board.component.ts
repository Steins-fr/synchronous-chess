import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, model, output, signal } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import CoordinateMove from '@app/classes/chess/interfaces/CoordinateMove';
import { PieceColor } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import { ChessPieceComponent } from '@app/components/chess/chess-piece/chess-piece.component';
import ChessBoardHelper, { FenBoard, ValidPlayBoard } from '@app/helpers/chess-board-helper';
import { Vector2dPipe } from '@app/pipes/vector2d.pipe';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss'],
    imports: [CommonModule, MatGridListModule, DragDropModule, ChessPieceComponent, Vector2dPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChessBoardComponent {
    private static readonly defaultValidPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);

    public readonly piecePicked = output<Vec2>();
    public readonly pieceDropped = output<Vec2>();
    public readonly pieceClicked = output<Vec2>();
    public readonly fenBoard = input.required<FenBoard>();
    public readonly validPlayBoard = model.required<ValidPlayBoard>();
    public readonly grabColor = input.required<PieceColor>();
    public readonly movePreview = input.required<CoordinateMove | undefined>();

    public readonly fromPreview = signal<Vec2 | null>(null);
    public readonly toPreview = signal<Vec2 | null>(null);
    public readonly pieceDragged = signal<Vec2>(new Vec2(-1, -1));
    public readonly cellHovered = signal<Vec2>(new Vec2(-1, -1));
    protected readonly range = [...Array(8).keys()];

    public constructor() {
        // When fenBoard changes, reset valid plays.
        effect(() => {
            this.fenBoard();
            this.validPlayBoard.set(ChessBoardComponent.defaultValidPlayBoard);
        });

        // When movePreview changes, update fromPreview and toPreview.
        effect(() => {
            const movePreview = this.movePreview();
            if (movePreview) {
                this.fromPreview.set(new Vec2(movePreview.from[0], movePreview.from[1]));
                this.toPreview.set(new Vec2(movePreview.to[0], movePreview.to[1]));
            } else {
                this.fromPreview.set(null);
                this.toPreview.set(null);
            }
        });
    }

    public dragStart(cellPos: Vec2): void {
        this.pieceDragged.set(cellPos);
    }

    public dragStop(): void {
        this.pieceDragged.set(new Vec2(-1, -1));
        this.cellHovered.set(new Vec2(-1, -1));
    }

    public dragEntered(cellPos: Vec2): void {
        this.cellHovered.set(cellPos);
    }

    public canBeDragged(cellPos: Vec2): boolean {
        const fenPiece = ChessBoardHelper.getFenPieceByVec(this.fenBoard(), cellPos);

        return ChessBoardHelper.pieceColor(fenPiece) === this.grabColor();
    }

    public isMovePreview(cellPos: Vec2): boolean {
        const fromPreview = this.fromPreview();
        const toPreview = this.toPreview();
        return (!!fromPreview && cellPos.equal(fromPreview.x, fromPreview.y)) || (!!toPreview && cellPos.equal(toPreview.x, toPreview.y));
    }
}
