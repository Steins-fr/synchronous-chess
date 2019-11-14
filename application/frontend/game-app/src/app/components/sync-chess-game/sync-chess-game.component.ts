import { Component } from '@angular/core';
import Piece, { PieceColor, PieceType } from 'src/app/classes/chess/piece/piece';
import Cell from 'src/app/classes/chess/board/cell';
import Vec2 from 'vec2';
import ChessBoardHelper, { Column, CellBoard } from 'src/app/helpers/chess-board-helper';
import SynchronousChessRules from 'src/app/classes/chess/rules/synchronous-chess-rules';
import ChessRules from 'src/app/classes/chess/rules/chess-rules';
import { RoomService } from 'src/app/services/room/room.service';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss']
})
export class SyncChessGameComponent {

    public cells: CellBoard = ChessBoardHelper.createCellBoard();
    public playedPiece: Vec2 = new Vec2(-1, -1);

    public constructor(
        public roomService: RoomService) {
    }

    private kingPlay(from: Vec2, to: Vec2, rules: ChessRules): void {
        // If this is a king move, check if it is a castling
        if (from.distance(to) === 2) {
            // The king has moved twice, this is a castling
            const castlingRook: Column = ChessBoardHelper.castlingRook(from, to);
            const rookCell: Cell = ChessBoardHelper.getCell(this.cells, new Vec2([castlingRook, from.y]));
            const rookNewCell: Cell = ChessBoardHelper.getCell(this.cells, from.add(to.subtract(from, true).divide(2, 2, true), true));
            rookNewCell.piece = rookCell.piece;
            rookCell.piece = undefined;
        }
        rules.isQueenSideCastleAvailable = false;
        rules.isKingSideCastelAvailable = false;
    }

    private rookPlay(from: Vec2, rules: ChessRules): void {
        switch (from.x) {
            case Column.A:
                rules.isQueenSideCastleAvailable = false;
                break;
            case Column.H:
                rules.isKingSideCastelAvailable = false;
                break;
        }
    }

    private play(to: Vec2): void {
        const from: Vec2 = new Vec2(this.playedPiece.toArray());

        const fromCell: Cell = ChessBoardHelper.getCell(this.cells, from);
        const toCell: Cell = ChessBoardHelper.getCell(this.cells, to);
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

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece = cellPos;
        this.pieceClicked(cellPos);
    }

    public pieceClicked(cellPos: Vec2): void {
        this.resetHighligh();
        const cell: Cell = ChessBoardHelper.getCell(this.cells, cellPos);
        const piece: Piece = cell.piece;
        const rules: SynchronousChessRules = this.getRules(piece.color);
        rules.getPossiblePlays(piece.type, cellPos, ChessBoardHelper.toSimpleBoard(this.cells)).forEach((posPlay: Vec2) => {
            ChessBoardHelper.getCell(this.cells, posPlay).validMove = true;
        });
    }

    private getRules(color: PieceColor): SynchronousChessRules {
        return color === PieceColor.BLACK ? SynchronousChessRules.blackRules : SynchronousChessRules.whiteRules;
    }

    public pieceDropped(cellPos: Vec2): void {
        this.play(cellPos);
        this.resetHighligh();
        this.playedPiece = new Vec2(-1, -1);
    }

    private resetHighligh(): void {
        this.cells.forEach((row: Array<Cell>) => row.forEach((cell: Cell) => cell.validMove = false));
    }
}
