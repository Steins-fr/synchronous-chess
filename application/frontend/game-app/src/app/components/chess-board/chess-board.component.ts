import { Component } from '@angular/core';
import Piece, { PieceColor } from 'src/app/classes/chess/piece/piece';
import Rook from 'src/app/classes/chess/piece/pieces/rook';
import Knight from 'src/app/classes/chess/piece/pieces/knight';
import Bishop from 'src/app/classes/chess/piece/pieces/bishop';
import Queen from 'src/app/classes/chess/piece/pieces/queen';
import King from 'src/app/classes/chess/piece/pieces/king';
import Pawn from 'src/app/classes/chess/piece/pieces/pawn';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import Cell from 'src/app/classes/chess/board/cell';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss']
})
export class ChessBoardComponent {
    public cells: Array<Cell> = [
        ...ChessBoardComponent.genMainRow(PieceColor.BLACK),
        ...Array(8).fill(null).map(() => new Pawn(PieceColor.BLACK)).map((piece: Piece) => new Cell(piece)),
        ...Array(32).fill(null).map(() => new Cell()),
        ...Array(8).fill(null).map(() => new Pawn(PieceColor.WHITE)).map((piece: Piece) => new Cell(piece)),
        ...ChessBoardComponent.genMainRow(PieceColor.WHITE)
    ];

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

    private move(from: number, to: number): void {
        const [f, t]: Array<Piece> = [this.cells[from].piece, this.cells[to].piece];
        this.cells[from].piece = t;
        this.cells[to].piece = f;
        this.cells[to].dragHover = false;
    }

    public drop(event: CdkDragDrop<Array<Piece>>): void {
        this.move(parseInt(event.previousContainer.id, 10), parseInt(event.container.id, 10));
    }

    public dragEntered(event: CdkDragDrop<Array<Piece>>): void {
        const cellId: number = parseInt(event.container.id, 10);
        this.cells[cellId].dragHover = true;
    }

    public dragExited(event: CdkDragDrop<Array<Piece>>): void {
        const cellId: number = parseInt(event.container.id, 10);
        this.cells[cellId].dragHover = false;
    }
}
