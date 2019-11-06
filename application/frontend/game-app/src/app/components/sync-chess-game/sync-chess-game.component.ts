import { Component } from '@angular/core';
import Piece, { PieceColor } from 'src/app/classes/chess/piece/piece';
import Cell from 'src/app/classes/chess/board/cell';
import Rook from 'src/app/classes/chess/piece/pieces/rook';
import Knight from 'src/app/classes/chess/piece/pieces/knight';
import Bishop from 'src/app/classes/chess/piece/pieces/bishop';
import Queen from 'src/app/classes/chess/piece/pieces/queen';
import King from 'src/app/classes/chess/piece/pieces/king';
import Pawn from 'src/app/classes/chess/piece/pieces/pawn';
import Vec2 from 'vec2';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss']
})
export class SyncChessGameComponent {


    public cells: Array<Array<Cell>> = [
        SyncChessGameComponent.genMainRow(PieceColor.BLACK),
        Array(8).fill(null).map(() => new Pawn(PieceColor.BLACK)).map((piece: Piece) => new Cell(piece)),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Cell()),
        Array(8).fill(null).map(() => new Pawn(PieceColor.WHITE)).map((piece: Piece) => new Cell(piece)),
        SyncChessGameComponent.genMainRow(PieceColor.WHITE)
    ];

    public playedPiece: Vec2 = new Vec2(-1, -1);

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
        const from: Vec2 = new Vec2(this.playedPiece.toArray());
        const [f, t]: Array<Piece> = [this.getCell(from).piece, this.getCell(to).piece];
        this.getCell(from).piece = t;
        this.getCell(to).piece = f;
        this.playedPiece = new Vec2(-1, -1);
    }

    private getCell(cellPos: Vec2): Cell {
        return this.cells[cellPos.y][cellPos.x];
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece = cellPos;
    }

    public pieceDropped(cellPos: Vec2): void {
        this.moveTo(cellPos);
    }
}
