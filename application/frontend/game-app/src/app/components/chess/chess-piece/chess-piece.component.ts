import { CommonModule } from '@angular/common';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { FenPiece } from '@app/classes/chess/rules/chess-rules';

@Component({
    selector: 'app-chess-piece',
    templateUrl: './chess-piece.component.html',
    styleUrls: ['./chess-piece.component.scss'],
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChessPieceComponent {
    private static readonly unicodePieces: Record<FenPiece, string> = {
        [FenPiece.BLACK_BISHOP]: '♝',
        [FenPiece.BLACK_KING]: '♚',
        [FenPiece.BLACK_KNIGHT]: '♞',
        [FenPiece.BLACK_PAWN]: '♟',
        [FenPiece.BLACK_QUEEN]: '♛',
        [FenPiece.BLACK_ROOK]: '♜',
        [FenPiece.WHITE_BISHOP]: '♗',
        [FenPiece.WHITE_KING]: '♔',
        [FenPiece.WHITE_KNIGHT]: '♘',
        [FenPiece.WHITE_PAWN]: '♙',
        [FenPiece.WHITE_QUEEN]: '♕',
        [FenPiece.WHITE_ROOK]: '♖',
        [FenPiece.EMPTY]: ''
    };

    @Input({ required: true }) public piece!: FenPiece;

    public render(): string {
        return ChessPieceComponent.unicodePieces[this.piece];
    }
}
