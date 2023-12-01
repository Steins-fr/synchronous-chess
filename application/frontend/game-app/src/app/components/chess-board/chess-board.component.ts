import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import CoordinateMove from '@app/classes/chess/interfaces/CoordinateMove';
import { PieceColor } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import { ChessBoardPieceComponent } from '@app/components/chess-board/piece/chess-board-piece.component';
import ChessBoardHelper, { FenBoard, ValidPlayBoard } from '@app/helpers/chess-board-helper';
import { Vector2dPipe } from '@app/pipes/vector2d.pipe';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss'],
    standalone: true,
    imports: [CommonModule, MatGridListModule, DragDropModule, ChessBoardPieceComponent, Vector2dPipe],
})
export class ChessBoardComponent implements OnChanges {

    private static readonly defaultValidPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);

    @Output() public piecePicked: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Output() public pieceDropped: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Output() public pieceClicked: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Input({ required: true }) public fenBoard: FenBoard = [];
    @Input({ required: true }) public validPlayBoard: ValidPlayBoard = ChessBoardComponent.defaultValidPlayBoard;
    @Input({ required: true }) public grabColor: PieceColor = PieceColor.NONE;
    @Input({ required: true }) public movePreview?: CoordinateMove;

    public fromPreview: Vec2 | null = null;
    public toPreview: Vec2 | null = null;
    public pieceDragged: Vec2 = new Vec2(-1, -1);
    public cellHovered: Vec2 = new Vec2(-1, -1);
    protected readonly range = [...Array(8).keys()];

    public ngOnChanges(changes: SimpleChanges): void {
        // When the board changes, reset valid plays.
        if (changes['fenBoard']) {
            this.validPlayBoard = ChessBoardComponent.defaultValidPlayBoard;
        }
        if (this.movePreview !== undefined) {
            this.fromPreview = new Vec2(this.movePreview.from[0], this.movePreview.from[1]);
            this.toPreview = new Vec2(this.movePreview.to[0], this.movePreview.to[1]);
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
        const fenPiece = ChessBoardHelper.getFenPieceByVec(this.fenBoard, cellPos);

        return !!fenPiece && ChessBoardHelper.pieceColor(fenPiece) === this.grabColor;
    }

    public isMovePreview(cellPos: Vec2): boolean {
        return (!!this.fromPreview && cellPos.equal(this.fromPreview.x, this.fromPreview.y)) || (!!this.toPreview && cellPos.equal(this.toPreview.x, this.toPreview.y));
    }
}
