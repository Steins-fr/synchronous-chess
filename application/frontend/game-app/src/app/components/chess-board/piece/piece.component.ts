import { Component, Input } from '@angular/core';
import Piece, { PieceColor, PieceType } from 'src/app/classes/chess/piece/piece';

@Component({
    selector: 'app-board-piece',
    templateUrl: './piece.component.html',
    styleUrls: ['./piece.component.scss']
})
export class PieceComponent {

    private static readonly unicodePieces: Map<PieceColor, Map<PieceType, string>> = new Map<PieceColor, Map<PieceType, string>>([
        [PieceColor.BLACK, new Map<PieceType, string>([
            [PieceType.BISHOP, '♝'],
            [PieceType.KING, '♚'],
            [PieceType.KNIGHT, '♞'],
            [PieceType.PAWN, '♟'],
            [PieceType.QUEEN, '♛'],
            [PieceType.ROOK, '♜'],
        ])],
        [PieceColor.WHITE, new Map<PieceType, string>([
            [PieceType.BISHOP, '♗'],
            [PieceType.KING, '♔'],
            [PieceType.KNIGHT, '♘'],
            [PieceType.PAWN, '♙'],
            [PieceType.QUEEN, '♕'],
            [PieceType.ROOK, '♖'],
        ])]
    ]);

    @Input() public piece: Piece;

    public render(): string {
        const unicodeColoredPieces: Map<PieceType, string> = PieceComponent.unicodePieces.get(this.piece.color);
        return unicodeColoredPieces.get(this.piece.type);
    }
}
