import { Component, Input } from '@angular/core';
import { FenPiece } from '../../../classes/chess/rules/chess-rules';

@Component({
    selector: 'app-board-piece',
    templateUrl: './piece.component.html',
    styleUrls: ['./piece.component.scss']
})
export class PieceComponent {

    private static readonly unicodePieces: Map<FenPiece, string> = new Map<FenPiece, string>([
        [FenPiece.BLACK_BISHOP, '♝'],
        [FenPiece.BLACK_KING, '♚'],
        [FenPiece.BLACK_KNIGHT, '♞'],
        [FenPiece.BLACK_PAWN, '♟'],
        [FenPiece.BLACK_QUEEN, '♛'],
        [FenPiece.BLACK_ROOK, '♜'],
        [FenPiece.WHITE_BISHOP, '♗'],
        [FenPiece.WHITE_KING, '♔'],
        [FenPiece.WHITE_KNIGHT, '♘'],
        [FenPiece.WHITE_PAWN, '♙'],
        [FenPiece.WHITE_QUEEN, '♕'],
        [FenPiece.WHITE_ROOK, '♖'],
    ]);

    @Input() public piece: FenPiece;

    public render(): string {
        return PieceComponent.unicodePieces.get(this.piece);
    }
}
