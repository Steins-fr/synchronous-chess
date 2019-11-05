import { Component } from '@angular/core';
import Piece, { PieceColor } from 'src/app/classes/chess/piece/piece';
import Rook from 'src/app/classes/chess/piece/pieces/rook';
import Knight from 'src/app/classes/chess/piece/pieces/knight';
import Bishop from 'src/app/classes/chess/piece/pieces/bishop';
import Queen from 'src/app/classes/chess/piece/pieces/queen';
import King from 'src/app/classes/chess/piece/pieces/king';
import Pawn from 'src/app/classes/chess/piece/pieces/pawn';

@Component({
    selector: 'app-chess-board',
    templateUrl: './chess-board.component.html',
    styleUrls: ['./chess-board.component.scss']
})
export class ChessBoardComponent {
    public cells: Array<Piece | null> = [
        ...ChessBoardComponent.genMainRow(PieceColor.BLACK),
        ...Array(8).fill(null).map(() => new Pawn(PieceColor.BLACK)),
        ...Array(32).fill(null),
        ...Array(8).fill(null).map(() => new Pawn(PieceColor.WHITE)),
        ...ChessBoardComponent.genMainRow(PieceColor.WHITE)
    ];

    private static genMainRow(color: PieceColor): Array<Piece> {
        return [
            new Rook(color),
            new Knight(color),
            new Bishop(color),
            new Queen(color),
            new King(color),
            new Bishop(color),
            new Knight(color),
            new Rook(color)
        ];
    }
}
