import { Component, Output, EventEmitter, Input } from '@angular/core';
import Cell from 'src/app/classes/chess/board/cell';
import Vec2 from 'vec2';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss']
})
export class ChessBoardComponent {

    @Output() public piecePicked: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Output() public pieceDropped: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Output() public pieceClicked: EventEmitter<Vec2> = new EventEmitter<Vec2>();
    @Input() public cells: Array<Array<Cell>> = [];

    public pieceDragged: Vec2 = new Vec2(-1, -1);
    public cellHovered: Vec2 = new Vec2(-1, -1);

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
}
