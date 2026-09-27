
import { Component, input, output } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { PieceType } from '@app/modules/chess/enums/piece-type.enum';
import { ChessPieceComponent } from '../chess-piece/chess-piece.component';

type PromotionPieceType = PieceType.BISHOP | PieceType.KNIGHT | PieceType.QUEEN | PieceType.ROOK;

@Component({
    selector: 'app-chess-promotion',
    templateUrl: './chess-promotion.component.html',
    styleUrls: ['./chess-promotion.component.scss'],
    imports: [MatGridListModule, ChessPieceComponent],
})
export class ChessPromotionComponent {

    private static readonly whitePieces: Readonly<Record<PromotionPieceType, FenPiece>> = {
        [PieceType.BISHOP]: FenPiece.WHITE_BISHOP,
        [PieceType.KNIGHT]: FenPiece.WHITE_KNIGHT,
        [PieceType.QUEEN]: FenPiece.WHITE_QUEEN,
        [PieceType.ROOK]: FenPiece.WHITE_ROOK
    };

    private static readonly blackPieces: Readonly<Record<PromotionPieceType, FenPiece>> = {
        [PieceType.BISHOP]: FenPiece.BLACK_BISHOP,
        [PieceType.KNIGHT]: FenPiece.BLACK_KNIGHT,
        [PieceType.QUEEN]: FenPiece.BLACK_QUEEN,
        [PieceType.ROOK]: FenPiece.BLACK_ROOK
    };

    public readonly color = input.required<PieceColor>();
    public readonly pieceType = output<PieceType>();

    protected readonly rookType: PromotionPieceType = PieceType.ROOK;
    protected readonly knightType: PromotionPieceType = PieceType.KNIGHT;
    protected readonly bishopType: PromotionPieceType = PieceType.BISHOP;
    protected readonly queenType: PromotionPieceType = PieceType.QUEEN;

    protected piece(pieceType: PromotionPieceType): FenPiece {
        const pieces: Readonly<Record<PromotionPieceType, FenPiece>> = this.color() === PieceColor.WHITE ? ChessPromotionComponent.whitePieces : ChessPromotionComponent.blackPieces;
        return pieces[pieceType];
    }

    protected onClick(pieceType: PromotionPieceType): void {
        this.pieceType.emit(pieceType);
    }
}
