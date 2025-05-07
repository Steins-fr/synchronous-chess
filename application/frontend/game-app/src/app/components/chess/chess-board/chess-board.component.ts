import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, OnChanges, SimpleChanges, input, model, output } from '@angular/core';
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
})
export class ChessBoardComponent implements OnChanges {

    private static readonly defaultValidPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);

    public readonly piecePicked = output<Vec2>();
    public readonly pieceDropped = output<Vec2>();
    public readonly pieceClicked = output<Vec2>();
    public readonly fenBoard = input.required<FenBoard>();
    public readonly validPlayBoard = model.required<ValidPlayBoard>();
    public readonly grabColor = input.required<PieceColor>();
    public readonly movePreview = input.required<CoordinateMove | undefined>();

    public fromPreview: Vec2 | null = null;
    public toPreview: Vec2 | null = null;
    public pieceDragged: Vec2 = new Vec2(-1, -1);
    public cellHovered: Vec2 = new Vec2(-1, -1);
    protected readonly range = [...Array(8).keys()];

    public ngOnChanges(changes: SimpleChanges): void {
        // FIXME: Rework this to use signals
        // When the board changes, reset valid plays.
        if (changes['fenBoard']) {
            this.validPlayBoard.set(ChessBoardComponent.defaultValidPlayBoard);
        }
        const movePreview = this.movePreview();
        if (movePreview !== undefined) {
            this.fromPreview = new Vec2(movePreview.from[0], movePreview.from[1]);
            this.toPreview = new Vec2(movePreview.to[0], movePreview.to[1]);
        } else {
            this.fromPreview = null;
            this.toPreview = null;
        }
    }

    public dragStart(cellPos: Vec2): void {
        this.pieceDragged = cellPos;
    }

    public dragStop(): void {
        this.pieceDragged = new Vec2(-1, -1);
        this.cellHovered = new Vec2(-1, -1);
    }

    public dragEntered(cellPos: Vec2): void {
        this.cellHovered = cellPos;
    }

    public canBeDragged(cellPos: Vec2): boolean {
        const fenPiece = ChessBoardHelper.getFenPieceByVec(this.fenBoard(), cellPos);

        return ChessBoardHelper.pieceColor(fenPiece) === this.grabColor();
    }

    public isMovePreview(cellPos: Vec2): boolean {
        return (!!this.fromPreview && cellPos.equal(this.fromPreview.x, this.fromPreview.y)) || (!!this.toPreview && cellPos.equal(this.toPreview.x, this.toPreview.y));
    }
}
