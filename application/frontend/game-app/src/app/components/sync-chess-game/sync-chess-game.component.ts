import { Component } from '@angular/core';
import Piece, { PieceColor, PieceType } from 'src/app/classes/chess/piece/piece';
import Cell from 'src/app/classes/chess/board/cell';
import Rook from 'src/app/classes/chess/piece/pieces/rook';
import Knight from 'src/app/classes/chess/piece/pieces/knight';
import Bishop from 'src/app/classes/chess/piece/pieces/bishop';
import Queen from 'src/app/classes/chess/piece/pieces/queen';
import King from 'src/app/classes/chess/piece/pieces/king';
import Pawn from 'src/app/classes/chess/piece/pieces/pawn';
import Vec2 from 'vec2';
import ChessHelper, { Column } from 'src/app/helpers/chess-helper';
import SynchronousChessRules from 'src/app/classes/chess/rules/synchronous-chess-rules';
import ChessRules from 'src/app/classes/chess/rules/chess-rules';

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

    private readonly whiteRules: SynchronousChessRules = SynchronousChessRules.whiteRules;
    private readonly blackRules: SynchronousChessRules = SynchronousChessRules.blackRules;

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

    private kingPlay(from: Vec2, to: Vec2, rules: ChessRules): void {
        // If this is a king move, check if it is a castling
        if (from.distance(to) === 2) {
            // The king has moved twice, this is a castling
            const castlingRook: Column = ChessHelper.castlingRook(from, to);
            const rookCell: Cell = this.getCell(new Vec2([castlingRook, from.y]));
            const rookNewCell: Cell = this.getCell(from.add(to.subtract(from, true).divide(2, 2, true), true));
            rookNewCell.piece = rookCell.piece;
            rookCell.piece = undefined;
        }
        rules.castlingA = false;
        rules.castlingH = false;
    }

    private rookPlay(from: Vec2, rules: ChessRules): void {
        switch (from.x) {
            case Column.A:
                rules.castlingA = false;
                break;
            case Column.H:
                rules.castlingH = false;
                break;
        }
    }

    private play(to: Vec2): void {
        const from: Vec2 = new Vec2(this.playedPiece.toArray());

        const fromCell: Cell = this.getCell(from);
        const toCell: Cell = this.getCell(to);
        if (toCell.validMove === false) {
            return;
        }

        const rules: ChessRules = this.getRules(fromCell.piece.color);

        toCell.piece = fromCell.piece;
        fromCell.piece = undefined;

        switch (toCell.piece.type) {
            case PieceType.KING:
                this.kingPlay(from, to, rules);
                break;
            case PieceType.ROOK:
                this.rookPlay(from, rules);
                break;
        }
    }

    private getCell(cellPos: Vec2): Cell {
        return this.cells[cellPos.y][cellPos.x];
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece = cellPos;

        const cell: Cell = this.getCell(this.playedPiece);
        const piece: Piece = cell.piece;
        const rules: SynchronousChessRules = this.getRules(piece.color);
        rules.getPossiblePlays(piece.type, this.playedPiece, ChessHelper.toSimpleBoard(this.cells)).forEach((posPlay: Vec2) => {
            this.getCell(posPlay).validMove = true;
        });
    }

    private getRules(color: PieceColor): SynchronousChessRules {
        return color === PieceColor.BLACK ? this.blackRules : this.whiteRules;
    }

    public pieceDropped(cellPos: Vec2): void {
        this.play(cellPos);
        this.resetHighligh();
    }

    private resetHighligh(): void {
        this.playedPiece = new Vec2(-1, -1);
        this.cells.forEach((row: Array<Cell>) => row.forEach((cell: Cell) => cell.validMove = false));
    }
}
