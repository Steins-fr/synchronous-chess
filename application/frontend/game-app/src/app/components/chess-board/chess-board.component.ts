import { Component } from '@angular/core';
import Piece, { PieceColor } from 'src/app/classes/chess/piece/piece';
import Rook from 'src/app/classes/chess/piece/pieces/rook';
import Knight from 'src/app/classes/chess/piece/pieces/knight';
import Bishop from 'src/app/classes/chess/piece/pieces/bishop';
import Queen from 'src/app/classes/chess/piece/pieces/queen';
import King from 'src/app/classes/chess/piece/pieces/king';
import Pawn from 'src/app/classes/chess/piece/pieces/pawn';
import Cell from 'src/app/classes/chess/board/cell';
import Vec2 from 'vec2';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss']
})
export class ChessBoardComponent {
    public cells: Array<Array<Cell>> = [
        ChessBoardComponent.genMainRow(PieceColor.BLACK),
        Array(8).fill(null).map(() => new Pawn(PieceColor.BLACK)).map((piece: Piece) => new Cell(piece)),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Pawn(PieceColor.WHITE)).map((piece: Piece) => new Cell(piece)),
        ChessBoardComponent.genMainRow(PieceColor.WHITE)
    ];
    public pieceDragged: Vec2 = new Vec2(-1, -1);

    private static genMainRow(color: PieceColor): Array<Cell> {
        return [
            new Rook(color),
            new Knight(color),
            new Bishop(color),
            new Queen(color),
            new King(color),
            new Bishop(color),
            new Knight(color),
            new Rook(color)
        ].map((piece: Piece) => new Cell(piece));
    }

    private moveTo(to: Vec2): void {
        const from: Vec2 = new Vec2(this.pieceDragged.toArray());
        const [f, t]: Array<Piece> = [this.getCell(from).piece, this.getCell(to).piece];
        this.getCell(from).piece = t;
        this.getCell(to).piece = f;
        this.getCell(to).dragHover = false;
        this.pieceDragged = new Vec2(-1, -1);
    }

    private getCell(cellPos: Vec2): Cell {
        return this.cells[cellPos.y][cellPos.x];
    }

    public dragStart(cellPos: Vec2): void {
        this.pieceDragged = cellPos;
    }

    public drop(cellPos: Vec2): void {
        this.moveTo(cellPos);
    }

    public dragEntered(cellPos: Vec2): void {
        this.getCell(cellPos).dragHover = true;
    }

    public dragExited(cellPos: Vec2): void {
        this.getCell(cellPos).dragHover = false;
    }
}
