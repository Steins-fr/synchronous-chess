import { Component, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard, ValidPlayBoard } from 'src/app/helpers/chess-board-helper';
import { PieceColor } from 'src/app/classes/chess/rules/chess-rules';
import CoordinateMove from 'src/app/classes/chess/interfaces/CoordinateMove';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss']
})
export class ChessBoardComponent implements OnChanges {

    private static readonly defaultValidPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);

    @Output() public piecePicked: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Output() public pieceDropped: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Output() public pieceClicked: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Input() public fenBoard: FenBoard = [];
    @Input() public validPlayBoard: ValidPlayBoard = ChessBoardComponent.defaultValidPlayBoard;
    @Input() public grabColor: PieceColor = PieceColor.NONE;
    @Input() public movePreview: CoordinateMove;

    public fromPreview: Vec2 = new Vec2(-1, -1);
    public toPreview: Vec2 = new Vec2(-1, -1);
    public pieceDragged: Vec2 = new Vec2(-1, -1);
    public cellHovered: Vec2 = new Vec2(-1, -1);

    public ngOnChanges(changes: SimpleChanges): void {
        // When the board changes, reset valid plays.
        if (changes.fenBoard !== undefined) {
            this.validPlayBoard = ChessBoardComponent.defaultValidPlayBoard;
        }
        if (this.movePreview !== undefined) {
            this.fromPreview = new Vec2(this.movePreview.from);
            this.toPreview = new Vec2(this.movePreview.to);
        } else {
            this.fromPreview = undefined;
            this.toPreview = undefined;
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
        return ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPiece(this.fenBoard, cellPos)) === this.grabColor;
    }

    public isMovePreview(cellPos: Vec2): boolean {
        if (this.fromPreview === undefined) {
            return false;
        }
        return cellPos.equal(this.fromPreview) || cellPos.equal(this.toPreview);
    }
}
