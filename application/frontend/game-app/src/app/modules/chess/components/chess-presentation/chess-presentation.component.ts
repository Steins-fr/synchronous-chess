import { Component } from '@angular/core';
import CoordinateMove, { Column, Row } from '@app/modules/chess/interfaces/CoordinateMove';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { ValidPlayBoard } from '@app/modules/chess/types/valid-play-board';
import { ChessBoardComponent } from '../chess/chess-board/chess-board.component';

/** Presents the game before joining a room: what it is, and a preview of the board */
@Component({
    selector: 'app-chess-presentation',
    templateUrl: './chess-presentation.component.html',
    styleUrl: './chess-presentation.component.scss',
    imports: [ChessBoardComponent],
})
export class ChessPresentationComponent {
    // A board to look at, no piece can be moved
    protected readonly board: FenBoard = ChessBoardHelper.createFenBoard();
    protected readonly validPlays: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
    protected readonly noColor: PieceColor = PieceColor.NONE;
    protected readonly preview: CoordinateMove = { from: [Column.E, Row._2], to: [Column.E, Row._4] };
}
