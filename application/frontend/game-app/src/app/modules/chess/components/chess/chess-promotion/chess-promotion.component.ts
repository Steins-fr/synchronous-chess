
import { Component, input, output } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { PieceType } from '@app/modules/chess/enums/piece-type.enum';
import { ChessPieceComponent } from '../chess-piece/chess-piece.component';

@Component({
    selector: 'app-chess-promotion',
    templateUrl: './chess-promotion.component.html',
    styleUrls: ['./chess-promotion.component.scss'],
    imports: [MatGridListModule, ChessPieceComponent],
})
export class ChessPromotionComponent {

    private static readonly whitePieces: Map<PieceType, FenPiece> = new Map<PieceType, FenPiece>([
        [PieceType.BISHOP, FenPiece.WHITE_BISHOP],
        [PieceType.KNIGHT, FenPiece.WHITE_KNIGHT],
        [PieceType.QUEEN, FenPiece.WHITE_QUEEN],
        [PieceType.ROOK, FenPiece.WHITE_ROOK]
    ]);

    private static readonly blackPieces: Map<PieceType, FenPiece> = new Map<PieceType, FenPiece>([
        [PieceType.BISHOP, FenPiece.BLACK_BISHOP],
        [PieceType.KNIGHT, FenPiece.BLACK_KNIGHT],
        [PieceType.QUEEN, FenPiece.BLACK_QUEEN],
        [PieceType.ROOK, FenPiece.BLACK_ROOK]
    ]);

    public readonly color = input.required<PieceColor>();
    public readonly pieceType = output<PieceType>();

    protected readonly rookType: PieceType = PieceType.ROOK;
    protected readonly knightType: PieceType = PieceType.KNIGHT;
    protected readonly bishopType: PieceType = PieceType.BISHOP;
    protected readonly queenType: PieceType = PieceType.QUEEN;

    protected piece(pieceType: PieceType): FenPiece {
        const pieceMap: Map<PieceType, FenPiece> = this.color() === PieceColor.WHITE ? ChessPromotionComponent.whitePieces : ChessPromotionComponent.blackPieces;
        return pieceMap.get(pieceType) ?? FenPiece.EMPTY;
    }

    protected onClick(pieceType: PieceType): void {
        this.pieceType.emit(pieceType);
    }
}
